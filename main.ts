import { Application } from "jsr:@oak/oak/application";
import { Router } from "jsr:@oak/oak/router";
import { load } from "@std/dotenv";
import oauthRouter from "./oauth/routes.ts";
import sql from "./db/client.ts";

// Load environment variables from .env file
await load({ export: true });

// Check database connection with retry logic for Docker
async function connectToDatabase(retries = 5, delay = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Simple query to check connection
      const result = await sql`SELECT 1 as connection_test`;
      console.log(
        `Database connection successful: ${result[0].connection_test === 1}`
      );
      return;
    } catch (error) {
      console.error(
        `Database connection attempt ${attempt}/${retries} failed:`,
        error
      );

      if (attempt < retries) {
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error("All database connection attempts failed.");
        console.error(
          "Please ensure PostgreSQL is running and .env is configured correctly."
        );
        console.error(
          "Run 'deno task setup-db' and 'deno task migrate' to set up the database."
        );
        Deno.exit(1);
      }
    }
  }
}

await connectToDatabase();

const router = new Router();
router.get("/", (ctx) => {
  ctx.response.body = `<!DOCTYPE html>
    <html>
      <head>
        <title>QVote - Quadratic Voting for Slack</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
          }
          .button {
            display: inline-block;
            background-color: #4A154B;
            color: white;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 4px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <h1>QVote - Quadratic Voting for Slack</h1>
        <p>Make better group decisions with quadratic voting in your Slack workspace.</p>
        <p>
          <a href="/oauth/authorize" class="button">Add to Slack</a>
        </p>
      </body>
    </html>
  `;
});

const app = new Application();

// Add middleware for logging
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url} - ${ms}ms`);
});

// Add error handling middleware
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error(err);
    ctx.response.status = 500;
    ctx.response.body = "Internal server error";
  }
});

// Register all routers
app.use(router.routes());
app.use(router.allowedMethods());
app.use(oauthRouter.routes());
app.use(oauthRouter.allowedMethods());

const port = parseInt(Deno.env.get("PORT") || "8080");
const useHttps = Deno.env.get("USE_HTTPS") === "true";

if (useHttps) {
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
    console.error(`Error setting up HTTPS server: ${error.message}`);
    console.error(`Failed to read certificate files: ${certFile}, ${keyFile}`);
    Deno.exit(1);
  }
} else {
  console.log(`QVote server starting on port ${port}...`);
  await app.listen({ port });
}

// Handle graceful shutdowns
Deno.addSignalListener("SIGINT", async () => {
  console.log("Shutting down server...");
  await sql.end();
  Deno.exit(0);
});

Deno.addSignalListener("SIGTERM", async () => {
  console.log("Shutting down server...");
  await sql.end();
  Deno.exit(0);
});
