// OAuth service for Slack authentication
import logger from "@utils/logger.ts";
import { fetchWithTimeout } from "@utils/http-client.ts";
import { sanitizeError } from "@utils/error-sanitization.ts";

// Define the token exchange response type
export type TokenExchangeResult = {
  success: boolean;
  data?: {
    accessToken: string;
    teamId: string;
    teamName: string;
    botUserId: string;
  };
  error?: string;
};

// Auth service class for Slack authentication
export class AuthService {
  // Store for state validation (in production use Redis/DB)
  private stateStore = new Map<string, { timestamp: number }>();

  // Generate the authorization URL for Slack OAuth
  generateAuthUrl(): { url: string; state: string } {
    const clientId = Deno.env.get("SLACK_CLIENT_ID") || "";
    // const redirectUri =
    //   Deno.env.get("SLACK_REDIRECT_URI") ||
    //   "http://localhost:8080/oauth/callback";

    // Generate state token and store it
    const state = crypto.randomUUID();
    this.stateStore.set(state, { timestamp: Date.now() });

    const slackAuthUrl = new URL("https://slack.com/oauth/v2/authorize");
    slackAuthUrl.searchParams.set("client_id", clientId);
    slackAuthUrl.searchParams.set(
      "scope",
      "commands chat:write channels:join",
    );
    slackAuthUrl.searchParams.set("state", state); // Anti-CSRF token

    return { url: slackAuthUrl.toString(), state };
  }

  // Validate state parameter to prevent CSRF attacks
  validateState(state: string): boolean {
    const stateData = this.stateStore.get(state);

    if (!stateData) {
      return false;
    }

    // State tokens expire after 10 minutes
    const isValid = Date.now() - stateData.timestamp < 10 * 60 * 1000;

    // Remove used state token
    this.stateStore.delete(state);

    return isValid;
  }

  // Exchange code for token with Slack API
  async exchangeCodeForToken(code: string): Promise<TokenExchangeResult> {
    try {
      const clientId = Deno.env.get("SLACK_CLIENT_ID") || "";
      const clientSecret = Deno.env.get("SLACK_CLIENT_SECRET") || "";
      // const redirectUri =
      //   Deno.env.get("SLACK_REDIRECT_URI") ||
      //   "http://localhost:8080/oauth/callback";

      // Exchange code for access token with timeout
      const response = await fetchWithTimeout("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          // redirect_uri: redirectUri,
        }),
        timeout: 10000, // 10 second timeout for OAuth
      });

      const data = await response.json();

      if (!data.ok) {
        logger.error("Slack OAuth error", { error: data.error });
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
      logger.error("Error during OAuth flow", error);
      const sanitizedMessage = sanitizeError(error, "OAuth token exchange");
      return {
        success: false,
        error: sanitizedMessage,
      };
    }
  }

  // Get success HTML response
  getSuccessHtml(): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>QVote Installation Successful</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              background-color: #f8f9fa;
              color: #333;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              padding: 2rem;
              text-align: center;
              background-color: white;
              border-radius: 10px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            .success-icon {
              font-size: 64px;
              color: #36B37E;
              margin-bottom: 1rem;
            }
            h1 {
              color: #4A154B;
              margin-top: 0;
            }
            .message {
              font-size: 18px;
              line-height: 1.6;
              margin: 1.5rem 0;
            }
            .actions {
              margin-top: 2rem;
            }
            .button {
              display: inline-block;
              background-color: #4A154B;
              color: white;
              text-decoration: none;
              padding: 12px 24px;
              border-radius: 4px;
              font-weight: bold;
              transition: background-color 0.2s;
            }
            .button:hover {
              background-color: #611f69;
            }
            .tips {
              margin-top: 2rem;
              font-size: 14px;
              background-color: #f5f7fa;
              padding: 1rem;
              border-radius: 8px;
              text-align: left;
            }
            .tips h2 {
              font-size: 16px;
              margin-top: 0;
            }
            .tips ul {
              padding-left: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✓</div>
            <h1>QVote Installed Successfully!</h1>
            <p class="message">
              QVote has been successfully installed to your Slack workspace. You're ready to start creating quadratic votes right away!
            </p>
            <div class="actions">
              <a href="slack://open" class="button">Open Slack</a>
            </div>
            <div class="tips">
              <h2>Getting Started:</h2>
              <ul>
                <li>Type <strong>/qvote</strong> in any channel to create a new vote</li>
                <li>Distribute voting credits to express your preferences</li>
                <li>Share results with your team to make better decisions</li>
              </ul>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}

// Create and export a singleton instance
export const authService = new AuthService();
