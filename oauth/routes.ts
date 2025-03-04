import { Router } from "jsr:@oak/oak/router";
import { saveWorkspace } from "../db/workspace.ts";

const router = new Router();

// Redirect users to Slack's OAuth authorization page
router.get("/oauth/authorize", (ctx) => {
  // Get environment variables within the handler to ensure they're fresh
  const clientId = Deno.env.get("SLACK_CLIENT_ID") || "";
  const redirectUri = Deno.env.get("SLACK_REDIRECT_URI") || "http://localhost:8080/oauth/callback";
  
  const slackAuthUrl = new URL("https://slack.com/oauth/v2/authorize");
  slackAuthUrl.searchParams.set("client_id", clientId);
  slackAuthUrl.searchParams.set("scope", "commands chat:write channels:read");
  slackAuthUrl.searchParams.set("redirect_uri", redirectUri);
  slackAuthUrl.searchParams.set("state", crypto.randomUUID()); // Anti-CSRF token

  ctx.response.redirect(slackAuthUrl.toString());
});

// Handle the OAuth callback from Slack
router.get("/oauth/callback", async (ctx) => {
  const url = new URL(ctx.request.url);
  const params = url.searchParams;
  const code = params.get("code");
  
  // Verify state parameter (anti-CSRF)
  // In a complete implementation, you would validate this against a stored value
  if (!params.get("state")) {
    ctx.response.status = 400;
    ctx.response.body = "Invalid request: missing state parameter";
    return;
  }

  if (!code) {
    ctx.response.status = 400;
    ctx.response.body = "Invalid request: missing authorization code";
    return;
  }

  try {
    // Get environment variables within the handler to ensure they're fresh
    const clientId = Deno.env.get("SLACK_CLIENT_ID") || "";
    const clientSecret = Deno.env.get("SLACK_CLIENT_SECRET") || "";
    const redirectUri = Deno.env.get("SLACK_REDIRECT_URI") || "http://localhost:8080/oauth/callback";
    
    // Exchange code for access token
    const response = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    const data = await response.json();
    
    if (!data.ok) {
      console.error("Slack OAuth error:", data.error);
      ctx.response.status = 500;
      ctx.response.body = `OAuth failed: ${data.error}`;
      return;
    }

    // Save workspace data in the database
    const accessToken = data.access_token;
    const teamId = data.team.id;
    const teamName = data.team.name;
    const botUserId = data.bot_user_id;
    
    await saveWorkspace(teamId, teamName, accessToken, botUserId);
    console.log(`Workspace saved: ${teamName} (${teamId})`);
    
    // Success page
    ctx.response.body = `
      <!DOCTYPE html>
      <html>
        <head><title>Installation Successful</title></head>
        <body>
          <h1>QVote installed successfully!</h1>
          <p>You can close this window and return to Slack.</p>
        </body>
      </html>
    `;
  } catch (error) {
    console.error("Error during OAuth flow:", error);
    ctx.response.status = 500;
    ctx.response.body = "Server error during OAuth process";
  }
});

export default router;
