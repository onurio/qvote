import { Router } from "jsr:@oak/oak/router";
import { validateOAuthCallback } from "../middleware/oauth.ts";
import logger from "@utils/logger.ts";
import { workspaceService } from "@db/prisma.ts";

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

// For testing - allows overriding the saveWorkspace function
export type SaveWorkspaceFuncType = (
  teamId: string,
  teamName: string,
  accessToken: string,
  botUserId: string,
) => Promise<unknown>;

let saveWorkspaceFunc: SaveWorkspaceFuncType = async (
  teamId: string,
  teamName: string,
  accessToken: string,
  botUserId: string,
) => {
  return await workspaceService.saveWorkspace(
    teamId,
    teamName,
    accessToken,
    botUserId,
  );
};

// Expose functions to override services for testing
export function setAuthService(services: AuthService) {
  authService = services;
}

export function setSaveWorkspaceFunc(func: SaveWorkspaceFuncType) {
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

    // Save workspace data to database using the service
    const { accessToken, teamId, teamName, botUserId } = tokenResult.data!;

    try {
      await saveWorkspaceFunc(teamId, teamName, accessToken, botUserId);
      logger.info(`Workspace saved: ${teamName} (${teamId})`);
    } catch (err) {
      console.log("Error saving workspace or test environment detected:", err);
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
