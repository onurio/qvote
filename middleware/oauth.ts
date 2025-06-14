import { Context, Next } from "jsr:@oak/oak";
import { authService } from "../oauth/services/auth.ts";
import logger from "@utils/logger.ts";

/**
 * Middleware to validate OAuth callback parameters
 *
 * This middleware checks for required OAuth parameters in the callback URL,
 * specifically the 'code' and 'state' parameters. If they're missing or invalid,
 * it returns appropriate error responses.
 */
export async function validateOAuthCallback(ctx: Context, next: Next) {
  try {
    const url = new URL(ctx.request.url);
    const params = url.searchParams;
    const code = params.get("code");
    const state = params.get("state");

    // Verify required parameters exist
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

    // Validate state parameter to prevent CSRF attacks
    if (!authService.validateState(state)) {
      logger.warn("Invalid OAuth state parameter", { state });
      ctx.response.status = 400;
      ctx.response.body = "Invalid request: state parameter validation failed";
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
    logger.error("Error in OAuth middleware:", error);
    ctx.response.status = 500;
    ctx.response.body = "Server error during OAuth process";
  }
}
