import { exchangeCodeForToken, generateAuthUrl, getSuccessHtml } from "./auth.ts";
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
    const authUrl = generateAuthUrl();

    // Check URL structure
    assertMatch(
      authUrl,
      /^https:\/\/slack\.com\/oauth\/v2\/authorize/,
      "URL should be a valid Slack OAuth URL",
    );

    // Check required parameters
    const url = new URL(authUrl);
    assertEquals(url.searchParams.get("client_id"), "test_client_id");
    assertEquals(
      url.searchParams.get("redirect_uri"),
      "https://example.com/callback",
    );
    assertEquals(
      url.searchParams.get("scope"),
      "commands chat:write channels:read channels:history channels:join",
    );

    // Verify state parameter is a UUID
    const state = url.searchParams.get("state");
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
    const authUrl = generateAuthUrl();
    const url = new URL(authUrl);

    assertEquals(url.searchParams.get("client_id"), "");
    assertEquals(
      url.searchParams.get("redirect_uri"),
      "http://localhost:8080/oauth/callback",
    );
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
      const result = await exchangeCodeForToken("test_code");

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
    const result = await exchangeCodeForToken("invalid_code");

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
    const result = await exchangeCodeForToken("test_code");

    assertEquals(result.success, false);
    assertEquals(result.error, "Server error during OAuth process");
  } finally {
    envStub.restore();
    globalThis.fetch = originalFetch;
  }
});

Deno.test("getSuccessHtml returns correct HTML", () => {
  const html = getSuccessHtml();

  // Check for key elements in the HTML
  assertMatch(html, /<title>QVote Installation Successful<\/title>/);
  assertMatch(html, /QVote Installed Successfully!/);
  assertMatch(html, /Type <strong>\/qvote<\/strong> in any channel/);
  assertMatch(html, /<a href="slack:\/\/open" class="button">Open Slack<\/a>/);
});
