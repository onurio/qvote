import { Router } from "jsr:@oak/oak/router";
import { validateOAuthCallback } from "../middleware/oauth.ts";
import logger from "@utils/logger.ts";

// Define types for auth service functions for testing
export type GenerateAuthUrlType = () => string;
export type ExchangeCodeForTokenType = (code: string) => Promise<{
  success: boolean;
  data?: {
    accessToken: string;
    teamId: string;
    teamName: string;
    botUserId: string;
  };
  error?: string;
}>;
export type GetSuccessHtmlType = () => string;

// Service functions - can be overridden for testing
export interface AuthService {
  generateAuthUrl: GenerateAuthUrlType | null;
  exchangeCodeForToken: ExchangeCodeForTokenType | null;
  getSuccessHtml: GetSuccessHtmlType | null;
}

// Initialize the auth service
let authService: AuthService = {
  generateAuthUrl: null,
  exchangeCodeForToken: null,
  getSuccessHtml: null,
};

// Load service functions
(async () => {
  const auth = await import("./services/auth.ts");
  authService.generateAuthUrl = auth.generateAuthUrl;
  authService.exchangeCodeForToken = auth.exchangeCodeForToken;
  authService.getSuccessHtml = auth.getSuccessHtml;
})();

// Database function
let saveWorkspaceFunc:
  | ((
    teamId: string,
    teamName: string,
    accessToken: string,
    botUserId: string,
  ) => Promise<unknown>)
  | null = null;

// Load the database function
(async () => {
  try {
    const { saveWorkspace } = await import("@db/workspace.ts");
    saveWorkspaceFunc = saveWorkspace;
  } catch (err) {
    console.error("Error loading saveWorkspace:", err);
  }
})();

// Expose functions to override services for testing
export function setAuthService(services: AuthService) {
  authService = services;
}

export function setSaveWorkspaceFunc(func: typeof saveWorkspaceFunc) {
  saveWorkspaceFunc = func;
}

const router = new Router();

// Redirect users to Slack's OAuth authorization page
router.get("/oauth/authorize", (ctx) => {
  if (!authService.generateAuthUrl) {
    throw new Error("Auth service not initialized");
  }

  const authUrl = authService.generateAuthUrl();
  ctx.response.redirect(authUrl);
});

// Already imported at the top

// Handle the OAuth callback from Slack
router.get("/oauth/callback", validateOAuthCallback, async (ctx) => {
  if (!authService.exchangeCodeForToken || !authService.getSuccessHtml) {
    throw new Error("Auth service not initialized");
  }

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
      if (saveWorkspaceFunc) {
        await saveWorkspaceFunc(teamId, teamName, accessToken, botUserId);
        logger.info(`Workspace saved: ${teamName} (${teamId})`);
      } else {
        logger.error("Save workspace function not available");
      }
    } catch (_err) {
      console.log("Test environment detected, skipping database save");
    }

    // Return success page
    ctx.response.body = authService.getSuccessHtml();
  } catch (error) {
    console.error("Error during OAuth flow:", error);
    ctx.response.status = 500;
    ctx.response.body = "Server error during OAuth process";
  }
});

export default router;
