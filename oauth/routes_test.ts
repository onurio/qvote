import { assertEquals, assertStringIncludes } from "@std/assert";
import { Application } from "jsr:@oak/oak";
import router from "./routes.ts";

// No need to mock DB for tests

// Mock environment variables
Deno.env.set("SLACK_CLIENT_ID", "test_client_id");
Deno.env.set("SLACK_CLIENT_SECRET", "test_client_secret");
Deno.env.set("SLACK_REDIRECT_URI", "http://localhost:8080/oauth/callback");

// Mock crypto.randomUUID for consistent testing
const originalRandomUUID = crypto.randomUUID;
// @ts-ignore: We need to override this for testing
crypto.randomUUID = () => "test-uuid-123";

// Original fetch function
const originalFetch = globalThis.fetch;

// Create test app
const createTestApp = () => {
  const app = new Application();
  app.use(router.routes());
  app.use(router.allowedMethods());
  return app;
};

Deno.test("OAuth authorize route redirects to Slack", async () => {
  const app = createTestApp();
  const resp = (await app.handle(
    new Request("http://localhost:8080/oauth/authorize"),
  )) as Response;

  assertEquals(resp.status, 302);
  const location = resp.headers.get("Location");
  assertStringIncludes(location || "", "https://slack.com/oauth/v2/authorize");
  assertStringIncludes(location || "", "client_id=test_client_id");
  assertStringIncludes(location || "", "state=test-uuid-123");
});

Deno.test("OAuth callback route handles missing code parameter", async () => {
  const app = createTestApp();
  const resp = (await app.handle(
    new Request("http://localhost:8080/oauth/callback?state=test-state"),
  )) as Response;

  assertEquals(resp.status, 400);
  const text = await resp.text();
  assertEquals(text, "Invalid request: missing authorization code");
});

Deno.test("OAuth callback route handles missing state parameter", async () => {
  const app = createTestApp();
  const resp = (await app.handle(
    new Request("http://localhost:8080/oauth/callback?code=test_code"),
  )) as Response;

  assertEquals(resp.status, 400);
  const text = await resp.text();
  assertEquals(text, "Invalid request: missing state parameter");
});

Deno.test("OAuth callback route handles successful authorization", async () => {
  // Mock fetch to return a successful response
  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          ok: true,
          access_token: "xoxb-test-token",
          team: { id: "T12345", name: "Test Team" },
          bot_user_id: "U12345",
        }),
        { status: 200 },
      ),
    );
  };

  const app = createTestApp();
  const resp = (await app.handle(
    new Request(
      "http://localhost:8080/oauth/callback?code=test_code&state=test-state",
    ),
  )) as Response;

  assertEquals(resp.status, 200);
  const text = await resp.text();
  assertStringIncludes(text, "QVote installed successfully");

  // Restore original fetch
  globalThis.fetch = originalFetch;
});

Deno.test("OAuth callback route handles Slack API error", async () => {
  // Mock fetch to return an error response
  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          ok: false,
          error: "invalid_code",
        }),
        { status: 200 },
      ),
    );
  };

  const app = createTestApp();
  const resp = (await app.handle(
    new Request(
      "http://localhost:8080/oauth/callback?code=invalid_code&state=test-state",
    ),
  )) as Response;

  assertEquals(resp.status, 500);
  const text = await resp.text();
  assertEquals(text, "OAuth failed: invalid_code");

  // Restore original fetch
  globalThis.fetch = originalFetch;
});

// Clean up mocks
Deno.test({
  name: "Clean up",
  fn() {
    crypto.randomUUID = originalRandomUUID;
    globalThis.fetch = originalFetch;
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
