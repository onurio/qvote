import { assertEquals } from "jsr:@std/assert";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { Context } from "jsr:@oak/oak";
import { createSlackVerifier } from "./slack-verification.ts";
import { crypto } from "jsr:@std/crypto";
import { encodeHex } from "jsr:@std/encoding/hex";
import logger from "@utils/logger.ts";

describe("Slack Signature Verification Middleware", () => {
  let originalEnv: Record<string, string | undefined> = {};
  const TEST_SIGNING_SECRET = "test_signing_secret";

  // Create fake loggers for testing
  let logInfo: string[] = [];
  let logWarn: string[] = [];
  let logError: string[] = [];

  // Override logger methods for testing
  const originalLoggerInfo = logger.info;
  const originalLoggerWarn = logger.warn;
  const originalLoggerError = logger.error;

  beforeEach(() => {
    // Save original env values
    originalEnv = {
      SLACK_SIGNING_SECRET: Deno.env.get("SLACK_SIGNING_SECRET"),
    };

    // Set test env values
    Deno.env.set("SLACK_SIGNING_SECRET", TEST_SIGNING_SECRET);

    // Mock logger methods
    logInfo = [];
    logWarn = [];
    logError = [];

    logger.info = (...args: unknown[]) => {
      logInfo.push(String(args[0]));
    };
    logger.warn = (...args: unknown[]) => {
      logWarn.push(String(args[0]));
    };
    logger.error = (...args: unknown[]) => {
      logError.push(String(args[0]));
    };
  });

  afterEach(() => {
    // Restore original env values
    if (originalEnv.SLACK_SIGNING_SECRET === undefined) {
      Deno.env.delete("SLACK_SIGNING_SECRET");
    } else {
      Deno.env.set("SLACK_SIGNING_SECRET", originalEnv.SLACK_SIGNING_SECRET);
    }

    // Restore original logger methods
    logger.info = originalLoggerInfo;
    logger.warn = originalLoggerWarn;
    logger.error = originalLoggerError;
  });

  it("should throw if signing secret is not set", () => {
    // Remove signing secret from env
    Deno.env.delete("SLACK_SIGNING_SECRET");

    // Creating the middleware should throw
    try {
      createSlackVerifier();
      // Should not reach here
      assertEquals(true, false, "Expected to throw but didn't");
    } catch (error) {
      assertEquals(error instanceof Error, true);
      if (error instanceof Error) {
        assertEquals(error.message.includes("required for production"), true);
      }
    }
  });

  it("should pass non-Slack requests through", async () => {
    const middleware = createSlackVerifier();
    let nextCalled = false;

    // Create mock context with non-Slack path
    const mockCtx = {
      request: {
        url: new URL("http://localhost/api/other"),
      },
    } as unknown as Context;

    // Mock next function
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
    };

    // Execute middleware
    await middleware(mockCtx, next);

    // Verify next was called
    assertEquals(nextCalled, true);
  });

  it("should reject requests without required headers", async () => {
    const middleware = createSlackVerifier();
    let nextCalled = false;

    // Create mock context
    const mockCtx = {
      request: {
        url: new URL("http://localhost/slack/commands"),
        headers: new Headers(),
      },
      response: {
        status: 200,
        body: null,
      },
    } as unknown as Context;

    // Mock next function
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
    };

    // Execute middleware
    await middleware(mockCtx, next);

    // Verify next was not called
    assertEquals(nextCalled, false);

    // Verify response
    assertEquals(mockCtx.response.status, 401);
    assertEquals(
      mockCtx.response.body,
      "Invalid request: missing verification headers",
    );

    // Verify logging
    assertEquals(logError.length, 1);
    assertEquals(logError[0].includes("Missing Slack verification"), true);
  });

  it("should reject requests with expired timestamps", async () => {
    const middleware = createSlackVerifier();
    let nextCalled = false;

    // Create timestamp more than 5 minutes old
    const oldTimestamp = Math.floor(Date.now() / 1000) - 301;

    // Create mock context
    const mockCtx = {
      request: {
        url: new URL("http://localhost/slack/commands"),
        headers: new Headers({
          "x-slack-signature": "v0=abc123",
          "x-slack-request-timestamp": oldTimestamp.toString(),
        }),
      },
      response: {
        status: 200,
        body: null,
      },
    } as unknown as Context;

    // Mock next function
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
    };

    // Execute middleware
    await middleware(mockCtx, next);

    // Verify next was not called
    assertEquals(nextCalled, false);

    // Verify response
    assertEquals(mockCtx.response.status, 401);
    assertEquals(mockCtx.response.body, "Invalid request: timestamp expired");

    // Verify logging
    assertEquals(logWarn.length, 1);
    assertEquals(logWarn[0].includes("timestamp expired"), true);
  });

  it("should reject requests with invalid signatures", async () => {
    const middleware = createSlackVerifier();
    let nextCalled = false;

    // Create valid timestamp (current time)
    const validTimestamp = Math.floor(Date.now() / 1000);

    // Create mock form data
    const formData = new URLSearchParams();
    formData.append("command", "/vote");
    formData.append("text", "Create a new vote");

    // Create mock context with invalid signature
    const mockCtx = {
      request: {
        url: new URL("http://localhost/slack/commands"),
        headers: new Headers({
          "x-slack-signature": "v0=invalid_signature",
          "x-slack-request-timestamp": validTimestamp.toString(),
          "content-type": "application/x-www-form-urlencoded",
        }),
        body: {
          text: () => {
            return Promise.resolve(formData.toString());
          },
        },
      },
      response: {
        status: 200,
        body: null,
      },
    } as unknown as Context;

    // Mock next function
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
    };

    // Execute middleware
    await middleware(mockCtx, next);

    // Verify next was not called
    assertEquals(nextCalled, false);

    // Verify response
    assertEquals(mockCtx.response.status, 401);
    assertEquals(mockCtx.response.body, "Invalid request signature");

    // Verify logging
    assertEquals(logWarn.length, 1);
    assertEquals(logWarn[0].includes("signature verification failed"), true);
  });

  it("should accept requests with valid signatures", async () => {
    const middleware = createSlackVerifier();
    let nextCalled = false;

    // Create valid timestamp (current time)
    const validTimestamp = Math.floor(Date.now() / 1000);

    // Create mock form data
    const formData = new URLSearchParams();
    formData.append("command", "/vote");
    formData.append("text", "Create a new vote");
    const requestBody = formData.toString();

    // Generate valid signature
    const signatureBaseString = `v0:${validTimestamp}:${requestBody}`;
    const key = new TextEncoder().encode(TEST_SIGNING_SECRET);
    const message = new TextEncoder().encode(signatureBaseString);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const hmacSignature = await crypto.subtle.sign("HMAC", cryptoKey, message);

    const validSignature = `v0=${encodeHex(new Uint8Array(hmacSignature))}`;

    // Create mock context with valid signature
    const mockCtx = {
      request: {
        url: new URL("http://localhost/slack/commands"),
        headers: new Headers({
          "x-slack-signature": validSignature,
          "x-slack-request-timestamp": validTimestamp.toString(),
          "content-type": "application/x-www-form-urlencoded",
        }),
        body: {
          text: () => {
            return Promise.resolve(requestBody);
          },
        },
      },
      response: {
        status: 200,
        body: null,
      },
    } as unknown as Context;

    // Mock next function
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
    };

    // Execute middleware
    await middleware(mockCtx, next);

    // Verify next was called
    assertEquals(nextCalled, true);

    // Verify logging
    assertEquals(logInfo.length, 1);
    assertEquals(logInfo[0].includes("verified successfully"), true);
  });

  it("should handle errors and reject requests", async () => {
    const middleware = createSlackVerifier();
    let nextCalled = false;

    // Create valid timestamp (current time)
    const validTimestamp = Math.floor(Date.now() / 1000);

    // Create mock context that will throw when accessing body
    const mockCtx = {
      request: {
        url: new URL("http://localhost/slack/commands"),
        headers: new Headers({
          "x-slack-signature": "v0=any_signature",
          "x-slack-request-timestamp": validTimestamp.toString(),
          "content-type": "application/x-www-form-urlencoded",
        }),
        body: {
          text: () => {
            throw new Error("Test error");
          },
        },
      },
      response: {
        status: 200,
        body: null,
      },
    } as unknown as Context;

    // Mock next function
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
    };

    // Execute middleware
    await middleware(mockCtx, next);

    // Verify next was not called
    assertEquals(nextCalled, false);

    // Verify response
    assertEquals(mockCtx.response.status, 401);
    assertEquals(mockCtx.response.body, "Error verifying request");

    // Verify logging
    assertEquals(logError.length, 1);
    assertEquals(logError[0].includes("Error verifying Slack signature"), true);
  });
});
