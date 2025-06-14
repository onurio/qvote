import { Context, Next } from "jsr:@oak/oak";
import logger from "@utils/logger.ts";

// Rate limit configuration
interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (ctx: Context) => string; // Function to generate rate limit key
  message?: string; // Custom error message
  skipFailedRequests?: boolean; // Whether to skip counting failed requests
  skipSuccessfulRequests?: boolean; // Whether to skip counting successful requests
}

// Rate limit store entry
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting (in production, use Redis)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Cleanup every minute

/**
 * Create rate limiting middleware
 */
export function createRateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (ctx) => getClientIp(ctx),
    message = "Too many requests, please try again later.",
    skipFailedRequests = false,
    skipSuccessfulRequests = false,
  } = config;

  return async (ctx: Context, next: Next) => {
    const key = keyGenerator(ctx);
    const now = Date.now();
    const resetTime = now + windowMs;

    // Get or create rate limit entry
    let entry = rateLimitStore.get(key);
    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime };
      rateLimitStore.set(key, entry);
    }

    // Check if rate limit exceeded
    if (entry.count >= maxRequests) {
      logger.warn("Rate limit exceeded", {
        key,
        count: entry.count,
        maxRequests,
        path: ctx.request.url.pathname,
      });

      ctx.response.status = 429;
      ctx.response.headers.set("X-RateLimit-Limit", maxRequests.toString());
      ctx.response.headers.set("X-RateLimit-Remaining", "0");
      ctx.response.headers.set("X-RateLimit-Reset", Math.ceil(entry.resetTime / 1000).toString());
      ctx.response.headers.set("Retry-After", Math.ceil((entry.resetTime - now) / 1000).toString());
      ctx.response.body = { error: message };
      return;
    }

    // Process the request
    await next();

    // Increment counter based on response status
    const shouldCount = !(
      (skipFailedRequests && ctx.response.status >= 400) ||
      (skipSuccessfulRequests && ctx.response.status < 400)
    );

    if (shouldCount) {
      entry.count++;
    }

    // Add rate limit headers
    ctx.response.headers.set("X-RateLimit-Limit", maxRequests.toString());
    ctx.response.headers.set(
      "X-RateLimit-Remaining",
      Math.max(0, maxRequests - entry.count).toString(),
    );
    ctx.response.headers.set("X-RateLimit-Reset", Math.ceil(entry.resetTime / 1000).toString());
  };
}

/**
 * Get client IP address from request
 */
function getClientIp(ctx: Context): string {
  // Check for forwarded headers (from reverse proxy)
  const forwarded = ctx.request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = ctx.request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback to connection info (may not be available in all environments)
  return "unknown";
}

/**
 * Create stricter rate limit for API endpoints
 */
export function createApiRateLimit() {
  return createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // 100 requests per 15 minutes
    message: "API rate limit exceeded. Please try again later.",
  });
}

/**
 * Create rate limit for OAuth endpoints
 */
export function createOAuthRateLimit() {
  return createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5, // 5 OAuth requests per minute
    message: "OAuth rate limit exceeded. Please try again later.",
  });
}

/**
 * Create rate limit for Slack commands
 */
export function createSlackCommandRateLimit() {
  return createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 commands per minute per user
    keyGenerator: (ctx) => {
      // For Slack commands, we'll use IP-based rate limiting for simplicity
      // The user_id extraction would need to be done after body parsing
      return getClientIp(ctx);
    },
    message: "Command rate limit exceeded. Please slow down.",
  });
}

/**
 * Create general rate limit for all requests
 */
export function createGeneralRateLimit() {
  return createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 1000, // 1000 requests per 15 minutes per IP
    message: "Rate limit exceeded. Please try again later.",
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  });
}
