import { Router } from "jsr:@oak/oak/router";
import { routeSlackCommand } from "./services/command.ts";
import { validateSlackWorkspace } from "../middleware/slack.ts";

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

export default router;
