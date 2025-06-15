import { assertEquals } from "@std/assert";
import { Context } from "jsr:@oak/oak";
import { apiSecurityHeaders, securityHeaders } from "./security-headers.ts";

// Helper to create a mock context
function createMockContext(options: {
  protocol?: string;
  pathname?: string;
  origin?: string;
} = {}): Context {
  const headers = new Headers();
  if (options.origin) {
    headers.set("origin", options.origin);
  }

  const request = {
    headers,
    url: new URL(`${options.protocol || "http"}://localhost${options.pathname || "/"}`),
  } as Context["request"];

  const responseHeaders = new Headers();
  const response = {
    headers: responseHeaders,
  } as Context["response"];

  return {
    request,
    response,
  } as Context;
}

// Helper to simulate middleware execution
async function simulateMiddleware(
  middleware: (ctx: Context, next: () => Promise<void>) => Promise<void>,
  ctx: Context,
) {
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
    return Promise.resolve();
  };

  await middleware(ctx, next);
  return nextCalled;
}

Deno.test("securityHeaders middleware", async (t) => {
  await t.step("sets basic security headers", async () => {
    const middleware = securityHeaders();
    const ctx = createMockContext();

    await simulateMiddleware(middleware, ctx);

    const headers = ctx.response.headers;
    assertEquals(headers.get("X-Frame-Options"), "DENY");
    assertEquals(headers.get("X-Content-Type-Options"), "nosniff");
    assertEquals(headers.get("X-XSS-Protection"), "1; mode=block");
    assertEquals(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  });

  await t.step("sets Content Security Policy", async () => {
    const middleware = securityHeaders();
    const ctx = createMockContext();

    await simulateMiddleware(middleware, ctx);

    const csp = ctx.response.headers.get("Content-Security-Policy");
    assertEquals(csp !== null, true);

    // Verify key CSP directives
    assertEquals(csp!.includes("default-src 'self'"), true);
    assertEquals(csp!.includes("script-src 'self' 'unsafe-inline' platform.slack-edge.com"), true);
    assertEquals(csp!.includes("style-src 'self' 'unsafe-inline'"), true);
    assertEquals(
      csp!.includes("img-src 'self' data: platform.slack-edge.com *.slack-edge.com"),
      true,
    );
    assertEquals(csp!.includes("connect-src 'self' slack.com *.slack.com"), true);
    assertEquals(csp!.includes("frame-src 'none'"), true);
    assertEquals(csp!.includes("object-src 'none'"), true);
    assertEquals(csp!.includes("base-uri 'self'"), true);
    assertEquals(csp!.includes("form-action 'self' slack.com"), true);
  });

  await t.step("sets Permissions Policy", async () => {
    const middleware = securityHeaders();
    const ctx = createMockContext();

    await simulateMiddleware(middleware, ctx);

    const permissionsPolicy = ctx.response.headers.get("Permissions-Policy");
    assertEquals(permissionsPolicy !== null, true);

    // Verify key permissions are restricted
    assertEquals(permissionsPolicy!.includes("geolocation=()"), true);
    assertEquals(permissionsPolicy!.includes("microphone=()"), true);
    assertEquals(permissionsPolicy!.includes("camera=()"), true);
    assertEquals(permissionsPolicy!.includes("magnetometer=()"), true);
    assertEquals(permissionsPolicy!.includes("gyroscope=()"), true);
    assertEquals(permissionsPolicy!.includes("fullscreen=(self)"), true);
    assertEquals(permissionsPolicy!.includes("payment=()"), true);
  });

  await t.step("sets HSTS header for HTTPS requests", async () => {
    const middleware = securityHeaders();
    const ctx = createMockContext({ protocol: "https" });

    await simulateMiddleware(middleware, ctx);

    const hsts = ctx.response.headers.get("Strict-Transport-Security");
    assertEquals(hsts, "max-age=31536000; includeSubDomains; preload");
  });

  await t.step("does not set HSTS header for HTTP requests", async () => {
    const middleware = securityHeaders();
    const ctx = createMockContext({ protocol: "http" });

    await simulateMiddleware(middleware, ctx);

    const hsts = ctx.response.headers.get("Strict-Transport-Security");
    assertEquals(hsts, null);
  });

  await t.step("sets cache control headers for secure pages", async () => {
    const middleware = securityHeaders();

    // Test OAuth path
    const oauthCtx = createMockContext({ pathname: "/oauth/callback" });
    await simulateMiddleware(middleware, oauthCtx);

    assertEquals(
      oauthCtx.response.headers.get("Cache-Control"),
      "no-store, no-cache, must-revalidate, private",
    );
    assertEquals(oauthCtx.response.headers.get("Pragma"), "no-cache");
    assertEquals(oauthCtx.response.headers.get("Expires"), "0");

    // Test Slack path
    const slackCtx = createMockContext({ pathname: "/slack/command" });
    await simulateMiddleware(middleware, slackCtx);

    assertEquals(
      slackCtx.response.headers.get("Cache-Control"),
      "no-store, no-cache, must-revalidate, private",
    );
    assertEquals(slackCtx.response.headers.get("Pragma"), "no-cache");
    assertEquals(slackCtx.response.headers.get("Expires"), "0");
  });

  await t.step("does not set cache control headers for non-secure pages", async () => {
    const middleware = securityHeaders();
    const ctx = createMockContext({ pathname: "/public" });

    await simulateMiddleware(middleware, ctx);

    assertEquals(ctx.response.headers.get("Cache-Control"), null);
    assertEquals(ctx.response.headers.get("Pragma"), null);
    assertEquals(ctx.response.headers.get("Expires"), null);
  });

  await t.step("calls next middleware", async () => {
    const middleware = securityHeaders();
    const ctx = createMockContext();

    const nextCalled = await simulateMiddleware(middleware, ctx);
    assertEquals(nextCalled, true);
  });
});

Deno.test("apiSecurityHeaders middleware", async (t) => {
  await t.step("sets basic API security headers", async () => {
    const middleware = apiSecurityHeaders();
    const ctx = createMockContext();

    await simulateMiddleware(middleware, ctx);

    const headers = ctx.response.headers;
    assertEquals(headers.get("X-Frame-Options"), "DENY");
    assertEquals(headers.get("X-Content-Type-Options"), "nosniff");
    assertEquals(headers.get("X-XSS-Protection"), "1; mode=block");
    assertEquals(headers.get("Referrer-Policy"), "no-referrer");
  });

  await t.step("sets strict CSP for API endpoints", async () => {
    const middleware = apiSecurityHeaders();
    const ctx = createMockContext();

    await simulateMiddleware(middleware, ctx);

    const csp = ctx.response.headers.get("Content-Security-Policy");
    assertEquals(csp, "default-src 'none'");
  });

  await t.step("always sets no-cache headers for API responses", async () => {
    const middleware = apiSecurityHeaders();
    const ctx = createMockContext({ pathname: "/api/public" });

    await simulateMiddleware(middleware, ctx);

    assertEquals(
      ctx.response.headers.get("Cache-Control"),
      "no-store, no-cache, must-revalidate, private",
    );
    assertEquals(ctx.response.headers.get("Pragma"), "no-cache");
    assertEquals(ctx.response.headers.get("Expires"), "0");
  });

  await t.step("sets CORS headers with origin from request", async () => {
    const middleware = apiSecurityHeaders();
    const ctx = createMockContext({ origin: "https://example.com" });

    await simulateMiddleware(middleware, ctx);

    const headers = ctx.response.headers;
    assertEquals(headers.get("Access-Control-Allow-Origin"), "https://example.com");
    assertEquals(headers.get("Access-Control-Allow-Credentials"), "true");
    assertEquals(headers.get("Access-Control-Allow-Methods"), "GET, POST, OPTIONS");
    assertEquals(headers.get("Access-Control-Allow-Headers"), "Content-Type, Authorization");
  });

  await t.step("sets empty CORS origin when no origin header", async () => {
    const middleware = apiSecurityHeaders();
    const ctx = createMockContext();

    await simulateMiddleware(middleware, ctx);

    assertEquals(ctx.response.headers.get("Access-Control-Allow-Origin"), "");
  });

  await t.step("calls next middleware", async () => {
    const middleware = apiSecurityHeaders();
    const ctx = createMockContext();

    const nextCalled = await simulateMiddleware(middleware, ctx);
    assertEquals(nextCalled, true);
  });
});

Deno.test("secure page detection", async (t) => {
  await t.step("identifies OAuth paths as secure", async () => {
    const middleware = securityHeaders();
    const paths = [
      "/oauth/",
      "/oauth/callback",
      "/oauth/authorize",
      "/oauth/token",
    ];

    for (const path of paths) {
      const ctx = createMockContext({ pathname: path });
      await simulateMiddleware(middleware, ctx);

      // Should have cache control headers
      assertEquals(
        ctx.response.headers.get("Cache-Control") !== null,
        true,
        `Path ${path} should be secure`,
      );
    }
  });

  await t.step("identifies Slack paths as secure", async () => {
    const middleware = securityHeaders();
    const paths = [
      "/slack/",
      "/slack/command",
      "/slack/oauth",
      "/slack/events",
    ];

    for (const path of paths) {
      const ctx = createMockContext({ pathname: path });
      await simulateMiddleware(middleware, ctx);

      // Should have cache control headers
      assertEquals(
        ctx.response.headers.get("Cache-Control") !== null,
        true,
        `Path ${path} should be secure`,
      );
    }
  });

  await t.step("does not identify non-secure paths", async () => {
    const middleware = securityHeaders();
    const paths = [
      "/",
      "/public",
      "/api/health",
      "/static/style.css",
      "/favicon.ico",
    ];

    for (const path of paths) {
      const ctx = createMockContext({ pathname: path });
      await simulateMiddleware(middleware, ctx);

      // Should not have cache control headers
      assertEquals(
        ctx.response.headers.get("Cache-Control"),
        null,
        `Path ${path} should not be secure`,
      );
    }
  });
});

Deno.test("middleware integration", async (t) => {
  await t.step("both middlewares can be used together", async () => {
    const generalMiddleware = securityHeaders();
    const apiMiddleware = apiSecurityHeaders();
    const ctx = createMockContext({ origin: "https://app.slack.com" });

    // Apply general security headers first
    await simulateMiddleware(generalMiddleware, ctx);

    // Then apply API-specific headers (should override some)
    await simulateMiddleware(apiMiddleware, ctx);

    // API middleware should override referrer policy
    assertEquals(ctx.response.headers.get("Referrer-Policy"), "no-referrer");

    // API middleware should override CSP
    assertEquals(ctx.response.headers.get("Content-Security-Policy"), "default-src 'none'");

    // Both should set basic security headers
    assertEquals(ctx.response.headers.get("X-Frame-Options"), "DENY");
    assertEquals(ctx.response.headers.get("X-Content-Type-Options"), "nosniff");

    // API middleware should set CORS headers
    assertEquals(ctx.response.headers.get("Access-Control-Allow-Origin"), "https://app.slack.com");
  });
});
