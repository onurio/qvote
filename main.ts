import { Application } from "jsr:@oak/oak/application";
import { Router } from "jsr:@oak/oak/router";
import { Context } from "jsr:@oak/oak/context";
import { load } from "@std/dotenv";
import oauthRouter from "@oauth/routes.ts";
import slackRouter from "@slack/routes.ts";
import { closeDatabase, connectToDatabase } from "@db/prisma.ts";
import { getHomePage } from "@ui/pages.ts";
import logger from "@utils/logger.ts";
import { createSlackVerifier } from "@middleware/slack-verification.ts";

// Load environment variables from .env file
await load({ export: true });

async function loggingMiddleware(ctx: Context, next: () => Promise<unknown>) {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  logger.info(`${ctx.request.method} ${ctx.request.url}`, { ms });
}

async function errorHandlingMiddleware(
  ctx: Context,
  next: () => Promise<unknown>,
) {
  try {
    await next();
  } catch (err) {
    logger.error("Request processing error", err);
    ctx.response.status = 500;
    ctx.response.body = "Internal server error";
  }
}

function setupServer() {
  // Setup root router for basic routes
  const router = new Router();
  router.get("/", async (ctx) => {
    ctx.response.body = await getHomePage();
  });

  // Create app
  const app = new Application();

  // Add global middleware
  app.use(loggingMiddleware);
  app.use(errorHandlingMiddleware);

  // Apply Slack verification to all Slack routes
  try {
    const verifySlackRequest = createSlackVerifier();
    app.use(verifySlackRequest);
  } catch (error) {
    logger.error("Failed to set up Slack verification", error);
    throw error; // Fail fast - Slack signature validation is required for production
  }

  // Register all routers
  // Root router
  app.use(router.routes());
  app.use(router.allowedMethods());

  // OAuth routes (for authentication)
  app.use(oauthRouter.routes());
  app.use(oauthRouter.allowedMethods());

  // Slack API routes
  app.use(slackRouter.routes());
  app.use(slackRouter.allowedMethods());

  return app;
}

async function startServer(app: Application) {
  const port = parseInt(Deno.env.get("PORT") || "8080");
  const useHttps = Deno.env.get("USE_HTTPS") === "true";

  if (useHttps) {
    await startHttpsServer(app, port);
  } else {
    logger.info(`QVote server starting on port ${port}...`);
    await app.listen({ port });
  }
}

async function startHttpsServer(app: Application, port: number) {
  // Get certificate files
  const certFile = Deno.env.get("CERT_FILE");
  const keyFile = Deno.env.get("KEY_FILE");

  if (!certFile || !keyFile) {
    logger.error("CERT_FILE and KEY_FILE must be set for HTTPS mode");
    Deno.exit(1);
  }

  try {
    // Verify the certificate files exist before trying to read them
    try {
      await Deno.stat(certFile);
      await Deno.stat(keyFile);
    } catch (error) {
      logger.error("Certificate files not found", { certFile, keyFile, error });
      Deno.exit(1);
    }

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
    logger.info(`HTTPS server started on port ${port}`);
  } catch (error) {
    logger.error(`Error setting up HTTPS server:`, error);
    logger.error(`Failed to read certificate files`, { certFile, keyFile });
    Deno.exit(1);
  }
}

function setupShutdownHandlers() {
  // Handle graceful shutdowns
  Deno.addSignalListener("SIGINT", async () => {
    logger.info("Shutting down server on SIGINT...");
    await closeDatabase();
    Deno.exit(0);
  });

  Deno.addSignalListener("SIGTERM", async () => {
    logger.info("Shutting down server on SIGTERM...");
    await closeDatabase();
    Deno.exit(0);
  });
}

// Main execution flow
await connectToDatabase();
const app = setupServer();
setupShutdownHandlers();
await startServer(app);
