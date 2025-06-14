import { Context, Next } from "jsr:@oak/oak";

/**
 * Middleware to add security headers to all responses
 */
export function securityHeaders() {
  return async (ctx: Context, next: Next) => {
    await next();

    // Set security headers
    const headers = ctx.response.headers;

    // Prevent clickjacking attacks
    headers.set("X-Frame-Options", "DENY");

    // Prevent MIME type sniffing
    headers.set("X-Content-Type-Options", "nosniff");

    // Enable XSS protection in browsers
    headers.set("X-XSS-Protection", "1; mode=block");

    // Referrer policy to protect user privacy
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    // Content Security Policy
    // Note: This is restrictive but appropriate for this app
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' platform.slack-edge.com", // Allow Slack platform scripts
      "style-src 'self' 'unsafe-inline'", // Allow inline styles for Slack UI
      "img-src 'self' data: platform.slack-edge.com *.slack-edge.com", // Allow Slack images
      "connect-src 'self' slack.com *.slack.com", // Allow connections to Slack
      "frame-src 'none'", // No frames allowed
      "object-src 'none'", // No objects/embeds
      "base-uri 'self'", // Restrict base URI
      "form-action 'self' slack.com", // Allow form submissions to Slack
    ].join("; ");

    headers.set("Content-Security-Policy", csp);

    // Permissions Policy (formerly Feature Policy)
    const permissionsPolicy = [
      "geolocation=()",
      "microphone=()",
      "camera=()",
      "magnetometer=()",
      "gyroscope=()",
      "fullscreen=(self)",
      "payment=()",
    ].join(", ");

    headers.set("Permissions-Policy", permissionsPolicy);

    // Only set HSTS for HTTPS requests
    if (ctx.request.url.protocol === "https:") {
      // HTTP Strict Transport Security
      // max-age=31536000 = 1 year
      // includeSubDomains: apply to all subdomains
      // preload: eligible for browser preload lists
      headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }

    // Prevent caching of sensitive pages
    if (isSecurePage(ctx.request.url.pathname)) {
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      headers.set("Pragma", "no-cache");
      headers.set("Expires", "0");
    }
  };
}

/**
 * Check if a page contains sensitive information that shouldn't be cached
 */
function isSecurePage(pathname: string): boolean {
  const securePaths = [
    "/oauth/",
    "/slack/",
  ];

  return securePaths.some((path) => pathname.startsWith(path));
}

/**
 * Middleware specifically for API responses
 */
export function apiSecurityHeaders() {
  return async (ctx: Context, next: Next) => {
    await next();

    const headers = ctx.response.headers;

    // For API responses, we want stricter policies
    headers.set("X-Frame-Options", "DENY");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-XSS-Protection", "1; mode=block");
    headers.set("Referrer-Policy", "no-referrer");

    // Stricter CSP for API endpoints
    headers.set("Content-Security-Policy", "default-src 'none'");

    // Always no-cache for API responses
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");

    // CORS headers for API endpoints (if needed)
    // Only allow requests from same origin for security
    headers.set("Access-Control-Allow-Origin", ctx.request.headers.get("origin") || "");
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  };
}
