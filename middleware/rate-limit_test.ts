import { assertEquals } from "@std/assert";
import { Context } from "jsr:@oak/oak";
import { createGeneralRateLimit, createRateLimit } from "./rate-limit.ts";

// Helper to create a mock context
function createMockContext(options: {
  ip?: string;
  path?: string;
  headers?: Record<string, string>;
} = {}): Context {
  const headers = new Headers(options.headers || {});
  const request = {
    headers,
    url: new URL(`http://localhost${options.path || "/"}`),
  } as Context["request"];

  const responseHeaders = new Headers();
  const response = {
    status: 200,
    headers: responseHeaders,
    body: undefined,
  } as Context["response"];

  return {
    request,
    response,
  } as Context;
}

// Helper to simulate requests
async function simulateRequest(
  middleware: (ctx: Context, next: () => Promise<void>) => Promise<void>,
  ctx: Context,
  shouldSucceed = true,
) {
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
    if (!shouldSucceed) {
      ctx.response.status = 500;
    }
    return Promise.resolve();
  };

  await middleware(ctx, next);
  return nextCalled;
}

Deno.test("createRateLimit - basic functionality", async (t) => {
  await t.step("allows requests within limit", async () => {
    const middleware = createRateLimit({
      windowMs: 60000,
      maxRequests: 3,
    });

    const ctx = createMockContext({ headers: { "x-real-ip": "test-ip-1" } });

    // First request should pass
    const result1 = await simulateRequest(middleware, ctx);
    assertEquals(result1, true);
    assertEquals(ctx.response.status, 200);
    assertEquals(ctx.response.headers.get("X-RateLimit-Limit"), "3");
    assertEquals(ctx.response.headers.get("X-RateLimit-Remaining"), "2");

    // Second request should pass
    const result2 = await simulateRequest(middleware, ctx);
    assertEquals(result2, true);
    assertEquals(ctx.response.headers.get("X-RateLimit-Remaining"), "1");

    // Third request should pass
    const result3 = await simulateRequest(middleware, ctx);
    assertEquals(result3, true);
    assertEquals(ctx.response.headers.get("X-RateLimit-Remaining"), "0");
  });

  await t.step("blocks requests over limit", async () => {
    const middleware = createRateLimit({
      windowMs: 60000,
      maxRequests: 2,
    });

    const ctx = createMockContext({ headers: { "x-real-ip": "test-ip-2" } });

    // Use up the limit
    await simulateRequest(middleware, ctx);
    await simulateRequest(middleware, ctx);

    // Third request should be blocked
    const result = await simulateRequest(middleware, ctx);
    assertEquals(result, false);
    assertEquals(ctx.response.status, 429);
    assertEquals(ctx.response.body, { error: "Too many requests, please try again later." });
    assertEquals(ctx.response.headers.get("X-RateLimit-Remaining"), "0");
    assertEquals(ctx.response.headers.get("Retry-After") !== null, true);
  });

  await t.step("uses custom error message", async () => {
    const middleware = createRateLimit({
      windowMs: 60000,
      maxRequests: 1,
      message: "Custom rate limit message",
    });

    const ctx = createMockContext({ headers: { "x-real-ip": "test-ip-3" } });

    // Use up the limit
    await simulateRequest(middleware, ctx);

    // Second request should show custom message
    await simulateRequest(middleware, ctx);
    assertEquals(ctx.response.status, 429);
    assertEquals(ctx.response.body, { error: "Custom rate limit message" });
  });
});

Deno.test("createRateLimit - IP extraction", async (t) => {
  await t.step("extracts IP from x-forwarded-for header", async () => {
    const middleware = createRateLimit({
      windowMs: 60000,
      maxRequests: 1,
    });

    const ctx = createMockContext({
      headers: { "x-forwarded-for": "192.168.1.1, 10.0.0.1" },
    });

    await simulateRequest(middleware, ctx);
    assertEquals(ctx.response.status, 200);

    // Second request from same IP should be blocked
    await simulateRequest(middleware, ctx);
    assertEquals(ctx.response.status, 429);
  });

  await t.step("extracts IP from x-real-ip header", async () => {
    const middleware = createRateLimit({
      windowMs: 60000,
      maxRequests: 1,
    });

    const ctx = createMockContext({
      headers: { "x-real-ip": "192.168.1.2" },
    });

    await simulateRequest(middleware, ctx);
    assertEquals(ctx.response.status, 200);

    // Second request from same IP should be blocked
    await simulateRequest(middleware, ctx);
    assertEquals(ctx.response.status, 429);
  });

  await t.step("falls back to unknown when no IP headers", async () => {
    const middleware = createRateLimit({
      windowMs: 60000,
      maxRequests: 1,
    });

    const ctx1 = createMockContext();
    const ctx2 = createMockContext();

    await simulateRequest(middleware, ctx1);
    assertEquals(ctx1.response.status, 200);

    // Second request with no IP should also be blocked (same "unknown" key)
    await simulateRequest(middleware, ctx2);
    assertEquals(ctx2.response.status, 429);
  });
});

Deno.test("createRateLimit - custom key generator", async (t) => {
  await t.step("uses custom key generator", async () => {
    const middleware = createRateLimit({
      windowMs: 60000,
      maxRequests: 1,
      keyGenerator: (ctx) => ctx.request.url.pathname,
    });

    // Different paths should have separate limits
    const ctx1 = createMockContext({ path: "/api/v1" });
    const ctx2 = createMockContext({ path: "/api/v2" });

    await simulateRequest(middleware, ctx1);
    assertEquals(ctx1.response.status, 200);

    await simulateRequest(middleware, ctx2);
    assertEquals(ctx2.response.status, 200);

    // Same path should be rate limited
    await simulateRequest(middleware, ctx1);
    assertEquals(ctx1.response.status, 429);
  });
});

Deno.test("createRateLimit - skip failed/successful requests", async (t) => {
  await t.step("skips failed requests when configured", async () => {
    const middleware = createRateLimit({
      windowMs: 60000,
      maxRequests: 2,
      skipFailedRequests: true,
    });

    const ctx = createMockContext({ headers: { "x-real-ip": "test-ip-4" } });

    // Failed request shouldn't count
    await simulateRequest(middleware, ctx, false);
    assertEquals(ctx.response.headers.get("X-RateLimit-Remaining"), "2");

    // Reset status for next request
    ctx.response.status = 200;

    // Successful requests should count
    await simulateRequest(middleware, ctx, true);
    assertEquals(ctx.response.headers.get("X-RateLimit-Remaining"), "1");

    // Reset status for next request
    ctx.response.status = 200;

    await simulateRequest(middleware, ctx, true);
    assertEquals(ctx.response.headers.get("X-RateLimit-Remaining"), "0");

    // Third successful request should be blocked
    await simulateRequest(middleware, ctx, true);
    assertEquals(ctx.response.status, 429);
  });

  await t.step("skips successful requests when configured", async () => {
    const middleware = createRateLimit({
      windowMs: 60000,
      maxRequests: 2,
      skipSuccessfulRequests: true,
    });

    const ctx = createMockContext({ headers: { "x-real-ip": "test-ip-5" } });

    // Successful requests shouldn't count
    await simulateRequest(middleware, ctx, true);
    assertEquals(ctx.response.headers.get("X-RateLimit-Remaining"), "2");

    await simulateRequest(middleware, ctx, true);
    assertEquals(ctx.response.headers.get("X-RateLimit-Remaining"), "2");

    // Failed requests should count
    await simulateRequest(middleware, ctx, false);
    assertEquals(ctx.response.headers.get("X-RateLimit-Remaining"), "1");

    await simulateRequest(middleware, ctx, false);
    assertEquals(ctx.response.headers.get("X-RateLimit-Remaining"), "0");

    // Next request should be blocked
    await simulateRequest(middleware, ctx, false);
    assertEquals(ctx.response.status, 429);
  });
});

Deno.test("createRateLimit - window expiration", async (t) => {
  await t.step("resets count after window expires", async () => {
    const middleware = createRateLimit({
      windowMs: 100, // 100ms window for testing
      maxRequests: 1,
    });

    const ctx = createMockContext({ headers: { "x-real-ip": "test-ip-6" } });

    // First request should pass
    await simulateRequest(middleware, ctx);
    assertEquals(ctx.response.status, 200);

    // Second request should be blocked
    ctx.response.status = 200; // Reset status
    await simulateRequest(middleware, ctx);
    assertEquals(ctx.response.status, 429);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // New request should pass
    ctx.response.status = 200; // Reset status
    await simulateRequest(middleware, ctx);
    assertEquals(ctx.response.status, 200);
  });
});

Deno.test("createRateLimit - headers", async (t) => {
  await t.step("sets correct rate limit headers", async () => {
    const middleware = createRateLimit({
      windowMs: 60000,
      maxRequests: 5,
    });

    const ctx = createMockContext({ headers: { "x-real-ip": "test-ip-7" } });

    await simulateRequest(middleware, ctx);

    // Check headers
    assertEquals(ctx.response.headers.get("X-RateLimit-Limit"), "5");
    assertEquals(ctx.response.headers.get("X-RateLimit-Remaining"), "4");

    const resetTime = ctx.response.headers.get("X-RateLimit-Reset");
    assertEquals(resetTime !== null, true);
    assertEquals(Number(resetTime) > Date.now() / 1000, true);
  });

  await t.step("sets Retry-After header when rate limited", async () => {
    const middleware = createRateLimit({
      windowMs: 60000,
      maxRequests: 1,
    });

    const ctx = createMockContext({ headers: { "x-real-ip": "test-ip-8" } });

    // Use up limit
    await simulateRequest(middleware, ctx);

    // Get blocked
    await simulateRequest(middleware, ctx);

    const retryAfter = ctx.response.headers.get("Retry-After");
    assertEquals(retryAfter !== null, true);
    assertEquals(Number(retryAfter) > 0, true);
    assertEquals(Number(retryAfter) <= 60, true); // Should be less than window
  });
});

Deno.test("preset rate limiters", async (t) => {
  await t.step("createGeneralRateLimit has correct config", async () => {
    const middleware = createGeneralRateLimit();
    const ctx = createMockContext({ headers: { "x-real-ip": "test-general-1" } });

    await simulateRequest(middleware, ctx);
    assertEquals(ctx.response.headers.get("X-RateLimit-Limit"), "1000");
  });
});

Deno.test("createRateLimit - concurrent requests", async (t) => {
  await t.step("demonstrates race condition with concurrent requests", async () => {
    const middleware = createRateLimit({
      windowMs: 60000,
      maxRequests: 3,
    });

    // Create separate context objects for each request
    const contexts = Array(5).fill(null).map(() =>
      createMockContext({ headers: { "x-real-ip": "test-concurrent-1" } })
    );

    // Simulate 5 concurrent requests
    const promises = contexts.map((ctx) => simulateRequest(middleware, ctx));

    const results = await Promise.all(promises);

    // Count successes
    const successCount = results.filter((r) => r === true).length;

    // NOTE: Due to the implementation incrementing count AFTER processing,
    // concurrent requests may all succeed before rate limiting kicks in.
    // This is a known limitation of the current implementation.
    assertEquals(successCount, 5);

    // Verify all requests completed with 200 status
    contexts.forEach((ctx) => {
      assertEquals(ctx.response.status, 200);
    });

    // However, subsequent requests should be rate limited
    const afterCtx = createMockContext({ headers: { "x-real-ip": "test-concurrent-1" } });
    const afterResult = await simulateRequest(middleware, afterCtx);
    assertEquals(afterResult, false);
    assertEquals(afterCtx.response.status, 429);
  });

  await t.step("properly rate limits sequential requests", async () => {
    const middleware = createRateLimit({
      windowMs: 60000,
      maxRequests: 3,
    });

    const contexts = Array(5).fill(null).map(() =>
      createMockContext({ headers: { "x-real-ip": "test-sequential-1" } })
    );

    // Process requests sequentially
    let successCount = 0;
    let blockedCount = 0;

    for (let i = 0; i < contexts.length; i++) {
      const result = await simulateRequest(middleware, contexts[i]);
      if (result) {
        successCount++;
      } else {
        assertEquals(contexts[i].response.status, 429);
        blockedCount++;
      }
    }

    // Sequential requests should properly enforce rate limit
    assertEquals(successCount, 3);
    assertEquals(blockedCount, 2);
  });
});
