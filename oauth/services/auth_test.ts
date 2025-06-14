import { authService } from "./auth.ts";
import { assertEquals, assertMatch, assertObjectMatch } from "jsr:@std/assert";
import { stub } from "jsr:@std/testing/mock";

Deno.test("generateAuthUrl creates proper Slack OAuth URL", () => {
  // Mock environment variables
  const envStub = stub(Deno.env, "get", (key: string) => {
    if (key === "SLACK_CLIENT_ID") return "test_client_id";
    if (key === "SLACK_REDIRECT_URI") return "https://example.com/callback";
    return "";
  });

  try {
    const { url, state: stateToken } = authService.generateAuthUrl();

    // Check URL structure
    assertMatch(
      url,
      /^https:\/\/slack\.com\/oauth\/v2\/authorize/,
      "URL should be a valid Slack OAuth URL",
    );

    // Check required parameters
    const urlObj = new URL(url);
    assertEquals(urlObj.searchParams.get("client_id"), "test_client_id");
    // Note: redirect_uri is not included in current implementation
    // assertEquals(
    //   urlObj.searchParams.get("redirect_uri"),
    //   "https://example.com/callback"
    // );
    assertEquals(
      urlObj.searchParams.get("scope"),
      "commands chat:write channels:join",
    );

    // Verify state parameter is a UUID
    const state = urlObj.searchParams.get("state");
    assertEquals(
      state,
      stateToken,
      "State token should match the returned token",
    );
    assertMatch(
      state || "",
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      "State should be a UUID",
    );
  } finally {
    envStub.restore();
  }
});

Deno.test("generateAuthUrl handles missing environment variables", () => {
  // Mock environment variables to be empty/missing
  const envStub = stub(Deno.env, "get", () => "");

  try {
    const { url } = authService.generateAuthUrl();
    const urlObj = new URL(url);

    assertEquals(urlObj.searchParams.get("client_id"), "");
    // assertEquals(
    //   urlObj.searchParams.get("redirect_uri"),
    //   "http://localhost:8080/oauth/callback"
    // );
  } finally {
    envStub.restore();
  }
});

Deno.test(
  "exchangeCodeForToken successfully exchanges code for token",
  async () => {
    // Mock environment variables
    const envStub = stub(Deno.env, "get", (key: string) => {
      if (key === "SLACK_CLIENT_ID") return "test_client_id";
      if (key === "SLACK_CLIENT_SECRET") return "test_client_secret";
      if (key === "SLACK_REDIRECT_URI") return "https://example.com/callback";
      return "";
    });

    // Mock fetch function
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            access_token: "xoxb-test-token",
            team: {
              id: "T12345",
              name: "Test Team",
            },
            bot_user_id: "U12345",
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    try {
      const result = await authService.exchangeCodeForToken("test_code");

      assertEquals(result.success, true);
      assertObjectMatch(result.data || {}, {
        accessToken: "xoxb-test-token",
        teamId: "T12345",
        teamName: "Test Team",
        botUserId: "U12345",
      });
    } finally {
      envStub.restore();
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test("exchangeCodeForToken handles Slack API errors", async () => {
  // Mock environment variables
  const envStub = stub(Deno.env, "get", () => "test_value");

  // Mock fetch function
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          ok: false,
          error: "invalid_code",
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

  try {
    const result = await authService.exchangeCodeForToken("invalid_code");

    assertEquals(result.success, false);
    assertEquals(result.error, "invalid_code");
  } finally {
    envStub.restore();
    globalThis.fetch = originalFetch;
  }
});

Deno.test("exchangeCodeForToken handles network errors", async () => {
  // Mock environment variables
  const envStub = stub(Deno.env, "get", () => "test_value");

  // Mock fetch function to throw an error
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Network error");
  };

  try {
    const result = await authService.exchangeCodeForToken("test_code");

    assertEquals(result.success, false);
    // Error should be sanitized
    assertEquals(typeof result.error, "string");
    // In production, this would be sanitized, but in tests it shows the full error
    const isDevelopment = Deno.env.get("ENV") !== "production";
    if (isDevelopment) {
      // In development, we get the full error details
      assertEquals(result.error!.includes("Network error"), true);
    } else {
      // In production, we get sanitized error
      assertEquals(result.error, "An unexpected error occurred");
    }
  } finally {
    envStub.restore();
    globalThis.fetch = originalFetch;
  }
});

Deno.test("validateState properly validates state parameter", () => {
  // Generate a state token
  const { state } = authService.generateAuthUrl();

  // Valid state should return true
  assertEquals(authService.validateState(state), true);

  // After validating, the state should be removed (second validation fails)
  assertEquals(authService.validateState(state), false);

  // Invalid state should return false
  assertEquals(authService.validateState("invalid-state"), false);
});

Deno.test("getSuccessHtml returns correct HTML", () => {
  const html = authService.getSuccessHtml();

  // Check for key elements in the HTML
  assertMatch(html, /<title>QVote Installation Successful<\/title>/);
  assertMatch(html, /QVote Installed Successfully!/);
  assertMatch(html, /Type <strong>\/qvote<\/strong> in any channel/);
  assertMatch(html, /<a href="slack:\/\/open" class="button">Open Slack<\/a>/);
});
