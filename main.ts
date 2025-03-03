import { Application } from "jsr:@oak/oak/application";
import { Router } from "jsr:@oak/oak/router";
import { load } from "@std/dotenv";
import oauthRouter from "./oauth/routes.ts";

// Load environment variables from .env file
await load({ export: true });

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
console.log(`QVote server starting on port ${port}...`);
app.listen({ port });
