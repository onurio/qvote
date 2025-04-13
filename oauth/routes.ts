import { Router } from "jsr:@oak/oak/router";
import { validateOAuthCallback } from "../middleware/oauth.ts";
import logger from "@utils/logger.ts";
import { workspaceService } from "@db/prisma.ts";
import { authService } from "./services/auth.ts";

const router = new Router();

// Redirect users to Slack's OAuth authorization page
router.get("/oauth/authorize", (ctx) => {
  const { url } = authService.generateAuthUrl();
  ctx.response.redirect(url);
});

// Handle the OAuth callback from Slack
router.get("/oauth/callback", validateOAuthCallback, async (ctx) => {
  // At this point, the middleware has already validated the parameters
  // and attached the code and state to ctx.state.oauth
  const { code } = ctx.state.oauth;

  try {
    // Exchange code for token
    const tokenResult = await authService.exchangeCodeForToken(code);

    if (!tokenResult.success) {
      ctx.response.status = 500;
      ctx.response.body = `OAuth failed: ${tokenResult.error}`;
      return;
    }

    // Save workspace data to database
    const { accessToken, teamId, teamName, botUserId } = tokenResult.data!;

    try {
      await workspaceService.saveWorkspace(teamId, teamName, accessToken, botUserId);
      logger.info(`Workspace saved: ${teamName} (${teamId})`);
    } catch (err) {
      logger.error("Error saving workspace:", err);
    }

    // Return success page
    ctx.response.body = authService.getSuccessHtml();
  } catch (error) {
    logger.error("Error during OAuth flow:", error);
    ctx.response.status = 500;
    ctx.response.body = "Server error during OAuth process";
  }
});

export default router;
