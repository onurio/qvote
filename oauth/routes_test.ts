import { assertEquals, assertStringIncludes } from "@std/assert";
import { Application } from "jsr:@oak/oak";
import router from "./routes.ts";
import { authService } from "./services/auth.ts";
import { workspaceService } from "@db/prisma.ts";
import { stub } from "jsr:@std/testing/mock";
import { TokenExchangeResult } from "./services/auth.ts";
import { tokenEncryption } from "../utils/encryption.ts";

// Create test app
const createTestApp = () => {
  const app = new Application();
  app.use(router.routes());
  app.use(router.allowedMethods());
  return app;
};

// Test auth URL result
const TEST_AUTH_RESULT = {
  url:
    "https://slack.com/oauth/v2/authorize?client_id=test_client_id&scope=commands%20chat:write%20channels:join&redirect_uri=http://localhost:8080/oauth/callback&state=test-uuid-123",
  state: "test-uuid-123",
};

// Test token result
const TEST_TOKEN_RESULT: TokenExchangeResult = {
  success: true,
  data: {
    accessToken: "xoxb-test-token",
    teamId: "T12345",
    teamName: "Test Team",
    botUserId: "U12345",
  },
};

// Error token result
const ERROR_TOKEN_RESULT: TokenExchangeResult = {
  success: false,
  error: "invalid_code",
};

// For tests we need to stub the following:
// 1. generateAuthUrl - To prevent random UUID and return predictable URL
// 2. exchangeCodeForToken - Because we can't really call Slack API

Deno.test({
  name: "OAuth authorize route redirects to Slack",
  fn: async () => {
    // Setup stub for generateAuthUrl
    const generateAuthUrlStub = stub(
      authService,
      "generateAuthUrl",
      () => TEST_AUTH_RESULT,
    );

    try {
      const app = createTestApp();
      const resp = (await app.handle(
        new Request("http://localhost:8080/oauth/authorize"),
      )) as Response;

      assertEquals(resp.status, 302);
      const location = resp.headers.get("Location");
      assertStringIncludes(
        location || "",
        "https://slack.com/oauth/v2/authorize",
      );
      assertStringIncludes(location || "", "client_id=test_client_id");
      assertStringIncludes(location || "", "state=test-uuid-123");
    } finally {
      generateAuthUrlStub.restore();
    }
  },
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

// Deno.test("OAuth callback route handles missing state parameter", async () => {
//   const app = createTestApp();
//   const resp = (await app.handle(
//     new Request("http://localhost:8080/oauth/callback?code=test_code")
//   )) as Response;

//   assertEquals(resp.status, 400);
//   const text = await resp.text();
//   assertEquals(text, "Invalid request: missing state parameter");
// });

// Deno.test("OAuth callback route handles invalid state parameter", async () => {
//   // Stub validateState to return false (invalid state)
//   const validateStateStub = stub(
//     authService,
//     "validateState",
//     () => false,
//   );

//   try {
//     const app = createTestApp();
//     const resp = (await app.handle(
//       new Request("http://localhost:8080/oauth/callback?code=test_code&state=invalid-state"),
//     )) as Response;

//     assertEquals(resp.status, 400);
//     const text = await resp.text();
//     assertEquals(text, "Invalid request: state parameter validation failed");
//   } finally {
//     validateStateStub.restore();
//   }
// });

Deno.test({
  name: "OAuth callback route handles successful authorization",
  fn: async () => {
    // We'll need to stub both the validateState and token exchange
    const validateStateStub = stub(authService, "validateState", () => true);

    const exchangeCodeStub = stub(
      authService,
      "exchangeCodeForToken",
      () => Promise.resolve(TEST_TOKEN_RESULT),
    );

    try {
      const app = createTestApp();
      const resp = (await app.handle(
        new Request(
          "http://localhost:8080/oauth/callback?code=test_code&state=test-state",
        ),
      )) as Response;

      assertEquals(resp.status, 200);
      const text = await resp.text();
      assertStringIncludes(text, "QVote Installation Successful");

      // Verify workspace was saved - can use the actual database
      const workspace = await workspaceService.getWorkspaceByTeamId("T12345");
      assertEquals(workspace?.teamName, "Test Team");
      // Token should be encrypted in storage, so decrypt it to verify
      if (workspace?.accessToken) {
        const decryptedToken = await tokenEncryption.decrypt(workspace.accessToken);
        assertEquals(decryptedToken, "xoxb-test-token");
      }
      assertEquals(workspace?.botUserId, "U12345");

      // Clean up test data
      await workspaceService.deleteWorkspaceByTeamId("T12345");
    } finally {
      validateStateStub.restore();
      exchangeCodeStub.restore();
    }
  },
});

Deno.test({
  name: "OAuth callback route handles Slack API error",
  fn: async () => {
    // We need to stub both validateState and exchangeCodeForToken
    const validateStateStub = stub(authService, "validateState", () => true);

    // Setup stub for exchangeCodeForToken with error response
    const exchangeCodeStub = stub(
      authService,
      "exchangeCodeForToken",
      () => Promise.resolve(ERROR_TOKEN_RESULT),
    );

    try {
      const app = createTestApp();
      const resp = await app.handle(
        new Request(
          "http://localhost:8080/oauth/callback?code=invalid_code&state=test-state",
        ),
      );

      assertEquals(resp?.status, 500);
      const text = await resp?.text();
      assertEquals(text, "OAuth failed: invalid_code");
    } finally {
      validateStateStub.restore();
      exchangeCodeStub.restore();
    }
  },
});
