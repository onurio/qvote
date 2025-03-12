// OAuth service for Slack authentication

// Generate the authorization URL for Slack OAuth
export function generateAuthUrl(): string {
  const clientId = Deno.env.get("SLACK_CLIENT_ID") || "";
  const redirectUri = Deno.env.get("SLACK_REDIRECT_URI") || "http://localhost:8080/oauth/callback";

  const slackAuthUrl = new URL("https://slack.com/oauth/v2/authorize");
  slackAuthUrl.searchParams.set("client_id", clientId);
  slackAuthUrl.searchParams.set("scope", "commands chat:write channels:read channels:history");
  slackAuthUrl.searchParams.set("redirect_uri", redirectUri);
  slackAuthUrl.searchParams.set("state", crypto.randomUUID()); // Anti-CSRF token

  return slackAuthUrl.toString();
}

// Parameter validation has been moved to middleware/oauth.ts

// Exchange code for token with Slack API
export async function exchangeCodeForToken(code: string): Promise<{
  success: boolean;
  data?: {
    accessToken: string;
    teamId: string;
    teamName: string;
    botUserId: string;
  };
  error?: string;
}> {
  try {
    const clientId = Deno.env.get("SLACK_CLIENT_ID") || "";
    const clientSecret = Deno.env.get("SLACK_CLIENT_SECRET") || "";
    const redirectUri = Deno.env.get("SLACK_REDIRECT_URI") ||
      "http://localhost:8080/oauth/callback";

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
      return {
        success: false,
        error: data.error,
      };
    }

    return {
      success: true,
      data: {
        accessToken: data.access_token,
        teamId: data.team.id,
        teamName: data.team.name || "Unknown Team",
        botUserId: data.bot_user_id || "Unknown Bot",
      },
    };
  } catch (error) {
    console.error("Error during OAuth flow:", error);
    return {
      success: false,
      error: "Server error during OAuth process",
    };
  }
}

// Get success HTML response
export function getSuccessHtml(): string {
  return `
    <!DOCTYPE html>
    <html>
      <head><title>Installation Successful</title></head>
      <body>
        <h1>QVote installed successfully!</h1>
        <p>You can close this window and return to Slack.</p>
      </body>
    </html>
  `;
}
