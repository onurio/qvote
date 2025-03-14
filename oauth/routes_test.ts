import { assertEquals, assertStringIncludes } from "@std/assert";
import { Application } from "jsr:@oak/oak";
import router, {
  AuthService,
  ExchangeCodeForTokenType,
  GenerateAuthUrlType,
  GetSuccessHtmlType,
  setAuthService,
  setSaveWorkspaceFunc,
} from "./routes.ts";

// Create mocked auth services
const generateAuthUrl: GenerateAuthUrlType = () =>
  "https://slack.com/oauth/v2/authorize?client_id=test_client_id&scope=commands%20chat:write%20channels:read%20channels:history&redirect_uri=http://localhost:8080/oauth/callback&state=test-uuid-123";

const exchangeCodeForToken: ExchangeCodeForTokenType = async (_code: string) => {
  // Add a minimal delay to make the async function actually await something
  await new Promise((resolve) => setTimeout(resolve, 0));

  return {
    success: true,
    data: {
      accessToken: "xoxb-test-token",
      teamId: "T12345",
      teamName: "Test Team",
      botUserId: "U12345",
    },
  };
};

const getSuccessHtml: GetSuccessHtmlType = () => `
  <!DOCTYPE html>
  <html>
    <head><title>Installation Successful</title></head>
    <body>
      <h1>QVote installed successfully!</h1>
      <p>You can close this window and return to Slack.</p>
    </body>
  </html>
`;

// Create mock service object
const mockServices: AuthService = {
  generateAuthUrl,
  exchangeCodeForToken,
  getSuccessHtml,
};

// Create test app
const createTestApp = () => {
  const app = new Application();
  app.use(router.routes());
  app.use(router.allowedMethods());
  return app;
};

Deno.test({
  name: "OAuth authorize route redirects to Slack",
  fn: async () => {
    // Set mock services for this test
    setAuthService(mockServices);

    const app = createTestApp();
    const resp = (await app.handle(
      new Request("http://localhost:8080/oauth/authorize"),
    )) as Response;

    assertEquals(resp.status, 302);
    const location = resp.headers.get("Location");
    assertStringIncludes(location || "", "https://slack.com/oauth/v2/authorize");
    assertStringIncludes(location || "", "client_id=test_client_id");
    assertStringIncludes(location || "", "state=test-uuid-123");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test("OAuth callback route handles missing code parameter", async () => {
  // We don't need to mock validateCallbackParams anymore since it's now in middleware
  // Just use the default mock services
  setAuthService(mockServices);

  const app = createTestApp();
  const resp = (await app.handle(
    new Request("http://localhost:8080/oauth/callback?state=test-state"),
  )) as Response;

  assertEquals(resp.status, 400);
  const text = await resp.text();
  assertEquals(text, "Invalid request: missing authorization code");
});

Deno.test("OAuth callback route handles missing state parameter", async () => {
  // We don't need to mock validateCallbackParams anymore since it's now in middleware
  // Just use the default mock services
  setAuthService(mockServices);

  const app = createTestApp();
  const resp = (await app.handle(
    new Request("http://localhost:8080/oauth/callback?code=test_code"),
  )) as Response;

  assertEquals(resp.status, 400);
  const text = await resp.text();
  assertEquals(text, "Invalid request: missing state parameter");
});

Deno.test({
  name: "OAuth callback route handles successful authorization",
  fn: async () => {
    // Set default mock services with successful response
    setAuthService(mockServices);

    // Mock save workspace to throw test error
    setSaveWorkspaceFunc(async (_teamId, _teamName, _accessToken, _botUserId) => {
      // Add a minimal delay to make the async function actually await something
      await new Promise((resolve) => setTimeout(resolve, 0));
      throw new Error("Test environment");
    });

    const app = createTestApp();
    const resp = (await app.handle(
      new Request(
        "http://localhost:8080/oauth/callback?code=test_code&state=test-state",
      ),
    )) as Response;

    assertEquals(resp.status, 200);
    const text = await resp.text();
    assertStringIncludes(text, "QVote installed successfully");
  },
  sanitizeResources: false,
});

Deno.test({
  name: "OAuth callback route handles Slack API error",
  fn: async () => {
    // Create a new mock service with failed token exchange
    const errorExchangeCodeForToken: ExchangeCodeForTokenType = async (_code: string) => {
      // Add a minimal delay to make the async function actually await something
      await new Promise((resolve) => setTimeout(resolve, 0));
      return {
        success: false,
        error: "invalid_code",
      };
    };

    setAuthService({
      ...mockServices,
      exchangeCodeForToken: errorExchangeCodeForToken,
    });

    const app = createTestApp();
    const resp = (await app.handle(
      new Request(
        "http://localhost:8080/oauth/callback?code=invalid_code&state=test-state",
      ),
    )) as Response;

    assertEquals(resp.status, 500);
    const text = await resp.text();
    assertEquals(text, "OAuth failed: invalid_code");
  },
  sanitizeResources: false,
});

// Clean up mocks
Deno.test({
  name: "Clean up",
  fn() {
    // No need to restore mocks since they're local to the test
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
