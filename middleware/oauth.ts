import { Context, Next } from "jsr:@oak/oak";

/**
 * Middleware to validate OAuth callback parameters
 *
 * This middleware checks for required OAuth parameters in the callback URL,
 * specifically the 'code' and 'state' parameters. If they're missing,
 * it returns appropriate error responses.
 */
export async function validateOAuthCallback(ctx: Context, next: Next) {
  try {
    const url = new URL(ctx.request.url);
    const params = url.searchParams;
    const code = params.get("code");
    const state = params.get("state");

    // Verify state parameter (anti-CSRF)
    // In a complete implementation, you would validate this against a stored value
    if (!state) {
      ctx.response.status = 400;
      ctx.response.body = "Invalid request: missing state parameter";
      return;
    }

    if (!code) {
      ctx.response.status = 400;
      ctx.response.body = "Invalid request: missing authorization code";
      return;
    }

    // Attach callback parameters to context state
    ctx.state.oauth = {
      code,
      state,
    };

    // Continue to the next middleware or route handler
    await next();
  } catch (error) {
    console.error("Error in OAuth middleware:", error);
    ctx.response.status = 500;
    ctx.response.body = "Server error during OAuth process";
  }
}
