import { Application } from "jsr:@oak/oak/application";
import { Router } from "jsr:@oak/oak/router";
import { Context } from "jsr:@oak/oak/context";
import { load } from "@std/dotenv";
import oauthRouter from "@oauth/routes.ts";
import slackRouter from "@slack/routes.ts";
import { closeDatabase, connectToDatabase } from "@db/prisma.ts";
import { getHomePage, getPrivacyPolicyPage, getTermsOfServicePage } from "@ui/pages.ts";
import logger from "@utils/logger.ts";
import { createSlackVerifier } from "@middleware/slack-verification.ts";
import { createGeneralRateLimit } from "@middleware/rate-limit.ts";
import { securityHeaders } from "@middleware/security-headers.ts";
import { sanitizeApiError } from "@utils/error-sanitization.ts";

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
    const path = ctx.request.url.pathname;
    const sanitizedError = sanitizeApiError(
      err,
      `${ctx.request.method} ${path}`,
    );

    // Set appropriate status code based on error type
    let status = 500;
    if (err instanceof Error) {
      switch (err.name) {
        case "ValidationError":
          status = 400;
          break;
        case "UnauthorizedError":
          status = 401;
          break;
        case "NotFoundError":
          status = 404;
          break;
        case "TimeoutError":
          status = 408;
          break;
        case "RateLimitError":
          status = 429;
          break;
      }
    }

    ctx.response.status = status;
    ctx.response.body = sanitizedError;
  }
}

function setupServer() {
  // Setup root router for basic routes
  const router = new Router();
  router.get("/", async (ctx) => {
    ctx.response.body = await getHomePage();
  });

  // Privacy policy route
  router.get("/privacy-policy", async (ctx) => {
    logger.info("Privacy policy page requested");
    ctx.response.body = await getPrivacyPolicyPage();
  });

  // Terms of service route
  router.get("/terms-of-service", async (ctx) => {
    logger.info("Terms of service page requested");
    ctx.response.body = await getTermsOfServicePage();
  });

  // Create app
  const app = new Application();

  // Add global middleware
  app.use(loggingMiddleware);
  app.use(errorHandlingMiddleware);

  // Add security headers
  app.use(securityHeaders());

  // Add rate limiting
  app.use(createGeneralRateLimit());

  // Serve static files
  app.use(async (ctx, next) => {
    const path = ctx.request.url.pathname;
    if (path.startsWith("/static/")) {
      logger.info(`Serving static file: ${path}`);

      // Extract the relative path after /static/
      const relativePath = path.substring("/static/".length);

      // Validate the path to prevent directory traversal
      if (
        relativePath.includes("..") ||
        relativePath.includes("//") ||
        relativePath.startsWith("/")
      ) {
        logger.warn(`Attempted path traversal: ${path}`);
        ctx.response.status = 400;
        ctx.response.body = "Invalid path";
        return;
      }

      // Construct safe file path
      const filePath = `./static/${relativePath}`;

      try {
        const fileContent = await Deno.readFile(filePath);

        // Set the appropriate content type based on file extension
        const ext = path.split(".").pop()?.toLowerCase();
        if (ext === "png") {
          ctx.response.headers.set("Content-Type", "image/png");
        } else if (ext === "jpg" || ext === "jpeg") {
          ctx.response.headers.set("Content-Type", "image/jpeg");
        } else if (ext === "css") {
          ctx.response.headers.set("Content-Type", "text/css");
        } else if (ext === "js") {
          ctx.response.headers.set("Content-Type", "application/javascript");
        }

        ctx.response.body = fileContent;
        return;
      } catch (error) {
        logger.error(`Error serving static file: ${filePath}`, error);
        ctx.response.status = 404;
        ctx.response.body = "File not found";
        return;
      }
    }
    await next();
  });

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

  // OAuth routes (for authentication) with stricter rate limiting and API security headers
  app.use(oauthRouter.routes());
  app.use(oauthRouter.allowedMethods());

  // Slack API routes with command-specific rate limiting and API security headers
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
