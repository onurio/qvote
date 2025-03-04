import { Application } from "jsr:@oak/oak/application";
import { Router } from "jsr:@oak/oak/router";
import { Context } from "jsr:@oak/oak/context";
import { load } from "@std/dotenv";
import oauthRouter from "./oauth/routes.ts";
import { closeDatabase, connectToDatabase } from "./db/connection.ts";
import { getHomePage } from "./ui/pages.ts";

// Load environment variables from .env file
await load({ export: true });

async function loggingMiddleware(ctx: Context, next: () => Promise<unknown>) {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url} - ${ms}ms`);
}

async function errorHandlingMiddleware(
  ctx: Context,
  next: () => Promise<unknown>,
) {
  try {
    await next();
  } catch (err) {
    console.error(err);
    ctx.response.status = 500;
    ctx.response.body = "Internal server error";
  }
}

function setupServer() {
  // Setup router
  const router = new Router();
  router.get("/", async (ctx) => {
    ctx.response.body = await getHomePage();
  });

  // Create app
  const app = new Application();

  // Add middleware
  app.use(loggingMiddleware);
  app.use(errorHandlingMiddleware);

  // Register all routers
  app.use(router.routes());
  app.use(router.allowedMethods());
  app.use(oauthRouter.routes());
  app.use(oauthRouter.allowedMethods());

  return app;
}

async function startServer(app: Application) {
  const port = parseInt(Deno.env.get("PORT") || "8080");
  const useHttps = Deno.env.get("USE_HTTPS") === "true";

  if (useHttps) {
    await startHttpsServer(app, port);
  } else {
    console.log(`QVote server starting on port ${port}...`);
    await app.listen({ port });
  }
}

async function startHttpsServer(app: Application, port: number) {
  // Get certificate files
  const certFile = Deno.env.get("CERT_FILE") || "./certs/cert.pem";
  const keyFile = Deno.env.get("KEY_FILE") || "./certs/key.pem";

  try {
    // Read the contents of the certificate and key files
    const cert = await Deno.readTextFile(certFile);
    const key = await Deno.readTextFile(keyFile);

    // Using updated Oak version for HTTPS support
    app.listen({
      port,
      secure: true,
      cert,
      key,
    });
    console.log(`HTTPS server started on port ${port}`);
  } catch (error) {
    console.error(`Error setting up HTTPS server: ${(error as Error).message}`);
    console.error(`Failed to read certificate files: ${certFile}, ${keyFile}`);
    Deno.exit(1);
  }
}

function setupShutdownHandlers() {
  // Handle graceful shutdowns
  Deno.addSignalListener("SIGINT", async () => {
    console.log("Shutting down server...");
    await closeDatabase();
    Deno.exit(0);
  });

  Deno.addSignalListener("SIGTERM", async () => {
    console.log("Shutting down server...");
    await closeDatabase();
    Deno.exit(0);
  });
}

// Main execution flow
await connectToDatabase();
const app = setupServer();
setupShutdownHandlers();
await startServer(app);
