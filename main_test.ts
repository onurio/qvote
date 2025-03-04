import { assertEquals, assertStringIncludes } from "@std/assert";
import { Application, Router } from "jsr:@oak/oak";
import { getHomePage } from "./ui/pages.ts";

// Create a simplified version of the router for testing
const createTestRouter = () => {
  const router = new Router();
  router.get("/", async (ctx) => {
    ctx.response.body = await getHomePage();
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
