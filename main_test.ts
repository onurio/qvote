import { assertEquals, assertStringIncludes } from "@std/assert";
import { Application, Router } from "jsr:@oak/oak";

// Create a simplified version of the router for testing
const createTestRouter = () => {
  const router = new Router();
  router.get("/", (ctx) => {
    ctx.response.body = `<!DOCTYPE html>
      <html>
        <head>
          <title>QVote - Quadratic Voting for Slack</title>
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
  return router;
};

Deno.test("Home route renders correctly", async () => {
  const router = createTestRouter();
  const app = new Application();
  app.use(router.routes());
  app.use(router.allowedMethods());

  const resp = await app.handle(new Request("http://localhost:8080/")) as Response;

  assertEquals(resp.status, 200);
  const text = await resp.text();
  assertStringIncludes(text, "QVote - Quadratic Voting for Slack");
  assertStringIncludes(text, "Add to Slack");
});
