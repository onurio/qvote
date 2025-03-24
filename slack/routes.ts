import { Router } from "jsr:@oak/oak/router";
import { routeSlackCommand } from "./services/command.ts";
import { routeSlackInteraction, SlackInteraction } from "./services/interactions.ts";
import { validateSlackWorkspace } from "../middleware/slack.ts";
import { getWorkspaceByTeamId } from "../db/workspace.ts";
import logger from "@utils/logger.ts";

const router = new Router();

// Handle Slack slash commands
// Use middleware to validate the request and workspace permissions
router.post("/slack/commands", validateSlackWorkspace, async (ctx) => {
  // At this point, the middleware has already validated the workspace
  // and attached the slack request and workspace to ctx.state.slack

  // Process the command and return the response
  const { request, workspace } = ctx.state.slack;
  const commandResponse = await routeSlackCommand(request, workspace);

  // Set response status and body
  ctx.response.status = commandResponse.status;
  ctx.response.body = commandResponse.body;
});

// Handle Slack interactivity (buttons, modals, etc.)
router.post("/slack/interactions", async (ctx) => {
  try {
    // Get the payload from the request
    const form = await ctx.request.body.form();

    // Slack sends the payload as JSON string in a form field named "payload"
    const payload: SlackInteraction = JSON.parse(form.get("payload") || "{}");

    // Log the interaction for debugging
    logger.info("Received interaction:", payload.type);

    if (!payload.team?.id) {
      ctx.response.status = 200;
      ctx.response.body = {
        text: "Missing team ID in the payload.",
        response_type: "ephemeral",
      };
      return;
    }

    // Get the workspace from the database
    const workspace = await getWorkspaceByTeamId(payload.team.id);

    if (!workspace) {
      ctx.response.status = 200;
      ctx.response.body = {
        text:
          "Your workspace is not registered with QVote. Please add the app to your workspace first.",
        response_type: "ephemeral",
      };
      return;
    }

    // Process the interaction and return the response
    const interactionResponse = await routeSlackInteraction(
      payload,
      workspace.id,
    );

    // Set response status, type and body
    ctx.response.status = interactionResponse.status;
    ctx.response.type = "application/json";
    ctx.response.body = interactionResponse.body;
  } catch (error) {
    console.error("Error in Slack interaction handler:", error);
    ctx.response.status = 200; // Slack expects 200 status even for errors
    ctx.response.type = "application/json";
    ctx.response.body = {
      text: "An error occurred while processing your interaction.",
      response_type: "ephemeral",
    };

    logger.error(
      "Sending error response to Slack:",
      JSON.stringify(ctx.response.body),
    );
  }
});

export default router;
