import { Context, Next } from "jsr:@oak/oak";
import { getWorkspaceByTeamId } from "../db/workspace.ts";
import { SlackRequest } from "../slack/services/command.ts";

/**
 * Middleware to validate Slack requests and verify workspace permissions
 *
 * This middleware extracts and validates Slack request parameters,
 * verifies the workspace exists, and attaches workspace data to the context state.
 */
export async function validateSlackWorkspace(ctx: Context, next: Next) {
  try {
    // Parse form data from Slack using the correct approach for Oak v17
    const form = await ctx.request.body.form();

    // Extract Slack request parameters
    const slackRequest: SlackRequest = {
      command: form.get("command") || "",
      text: form.get("text") || "",
      responseUrl: form.get("response_url") || "",
      teamId: form.get("team_id") || "",
      channelId: form.get("channel_id") || "",
      userId: form.get("user_id") || "",
      triggerId: form.get("trigger_id") || "",
    };

    // In production, you should verify the request using the Slack signing secret
    // https://api.slack.com/authentication/verifying-requests-from-slack

    // Verify the workspace exists
    const workspace = await getWorkspaceByTeamId(slackRequest.teamId);

    if (!workspace) {
      ctx.response.status = 200; // Slack expects 200 status even for errors
      ctx.response.body = {
        response_type: "ephemeral",
        text:
          "Your workspace is not registered with QVote. Please add the app to your workspace first.",
      };
      return; // Stop execution
    }

    // Attach workspace and request info to the context state
    ctx.state.slack = {
      request: slackRequest,
      workspace: workspace,
    };

    // Continue to the next middleware or route handler
    await next();
  } catch (error) {
    console.error("Error in Slack middleware:", error);
    // Add more detailed logging to help debugging
    console.error("Request:", ctx.request);
    console.error("Request details:", {
      headers: ctx.request.headers,
      method: ctx.request.method,
      url: ctx.request.url.toString(),
    });

    ctx.response.status = 200; // Slack expects 200 status even for errors
    ctx.response.body = {
      response_type: "ephemeral",
      text: "An error occurred while processing your request.",
    };
  }
}
