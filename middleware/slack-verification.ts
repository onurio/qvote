import { Context, Next } from "jsr:@oak/oak";
import { crypto } from "jsr:@std/crypto";
import { encodeHex } from "jsr:@std/encoding/hex";
import logger from "@utils/logger.ts";

/**
 * Production-ready middleware for verifying Slack request signatures
 *
 * This middleware implements Slack's signature verification protocol
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function createSlackVerifier() {
  const signingSecret = Deno.env.get("SLACK_SIGNING_SECRET");

  if (!signingSecret) {
    logger.error("SLACK_SIGNING_SECRET not set in environment variables");
    throw new Error("SLACK_SIGNING_SECRET is required for production use");
  }

  // Create and return the middleware function
  return async function verifySlackSignature(ctx: Context, next: Next) {
    // Only process Slack routes
    if (!ctx.request.url.pathname.startsWith("/slack/")) {
      return next();
    }

    // 1. Get required headers
    const signature = ctx.request.headers.get("x-slack-signature");
    const timestamp = ctx.request.headers.get("x-slack-request-timestamp");

    if (!signature || !timestamp) {
      logger.error("Missing Slack verification headers", {
        path: ctx.request.url.pathname,
        hasSignature: !!signature,
        hasTimestamp: !!timestamp,
      });
      ctx.response.status = 401;
      ctx.response.body = "Invalid request: missing verification headers";
      return;
    }

    // 2. Verify timestamp is within 5 minutes to prevent replay attacks
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      logger.warn("Slack request timestamp expired", {
        timestamp,
        now,
        diff: Math.abs(now - parseInt(timestamp)),
      });
      ctx.response.status = 401;
      ctx.response.body = "Invalid request: timestamp expired";
      return;
    }

    try {
      // 3. Get the raw request body
      const rawBody = await ctx.request.body.text();
      // 4. Create the signature base string
      const baseString = `v0:${timestamp}:${rawBody}`;

      // 5. Compute the signature
      const key = new TextEncoder().encode(signingSecret);
      const message = new TextEncoder().encode(baseString);

      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        key,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );

      const hmacSignature = await crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        message,
      );

      const computedSignature = `v0=${
        encodeHex(
          new Uint8Array(hmacSignature),
        )
      }`;

      // 6. Compare signatures using a constant-time comparison
      const computedBytes = new TextEncoder().encode(computedSignature);
      const providedBytes = new TextEncoder().encode(signature);

      // Implement constant-time comparison manually
      let equal = computedBytes.length === providedBytes.length;
      let timingSafeResult = 0;

      // Only compare if lengths are equal, but always loop to maintain constant time
      for (let i = 0; i < Math.max(computedBytes.length, providedBytes.length); i++) {
        // If we're past the end of either array, use 0, else use the actual value
        const a = i < computedBytes.length ? computedBytes[i] : 0;
        const b = i < providedBytes.length ? providedBytes[i] : 0;

        // XOR will be 0 if bytes are equal, non-zero if different
        // Accumulate using bitwise OR to detect any difference
        timingSafeResult |= a ^ b;
      }

      // If any bytes were different, timingSafeResult will be non-zero
      equal = equal && (timingSafeResult === 0);

      if (!equal) {
        // Enhanced debug logging for signature mismatch
        logger.warn("Slack signature verification failed", {
          requestPath: ctx.request.url.pathname,
          expected: signature,
          computed: computedSignature,
          timestamp,
          baseStringLength: baseString.length,
          bodyLength: rawBody.length,
          bodyStart: rawBody.substring(0, 30),
          bodyEnd: rawBody.substring(rawBody.length - 30),
        });

        ctx.response.status = 401;
        ctx.response.body = "Invalid request signature";
        return;
      }

      logger.info("Slack signature verified successfully", {
        path: ctx.request.url.pathname,
      });

      // Continue to next middleware
      await next();
    } catch (error: unknown) {
      // Handle error with proper type checking
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error("Error verifying Slack signature", {
        error: errorMessage,
        stack: errorStack,
      });

      // In production, always reject on verification errors
      ctx.response.status = 401;
      ctx.response.body = "Error verifying request";
    }
  };
}
