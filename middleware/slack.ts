import { Context, Next } from "jsr:@oak/oak";
import { getWorkspaceByTeamId } from "../db/workspace.ts";
import { SlackRequest } from "../slack/services/command.ts";
import logger from "@utils/logger.ts";
import { prisma } from "@db/prisma.ts";

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

    // Verify the workspace exists
    const workspace = await getWorkspaceByTeamId(prisma, slackRequest.teamId);

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
    logger.error("Error in Slack middleware:", error);
    // Add more detailed logging to help debugging
    logger.error("Request details:", {
      headers: Object.fromEntries(ctx.request.headers.entries()),
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
