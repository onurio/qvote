import { InteractionResponse, SlackInteraction } from "./types.ts";
import { handleCreateVoteSubmission } from "./vote-creation.ts";
import { handleEndVote, handleShowVoteResults } from "./vote-management.ts";
import { handleOpenVoteModal } from "./vote-modal.ts";
import { handleVoteSubmission } from "./vote-submission.ts";
import logger from "@utils/logger.ts";

// Route the interaction to the appropriate handler
export async function routeSlackInteraction(
  payload: SlackInteraction,
  workspaceId: string,
): Promise<InteractionResponse> {
  logger.info("Routing interaction", { type: payload.type });

  switch (payload.type) {
    case "block_actions":
      return await handleBlockActions(payload, workspaceId);
    case "view_submission":
      return await handleViewSubmission(payload, workspaceId);
    default:
      logger.warn(`Unknown interaction type`, { type: payload.type });
      return {
        status: 200,
        body: {
          text: "This interaction type is not yet supported.",
          response_type: "ephemeral",
        },
      };
  }
}

// Handle block actions (buttons, select menus, etc.)
async function handleBlockActions(
  payload: SlackInteraction,
  workspaceId: string,
): Promise<InteractionResponse> {
  logger.debug("Handling block actions", payload);
  if (!payload.actions || payload.actions.length === 0) {
    return {
      status: 200,
      body: {
        text: "No action was provided.",
        response_type: "ephemeral",
      },
    };
  }

  // Get the first action
  const action = payload.actions[0];
  logger.info("Handling action", { actionId: action.action_id });

  switch (action.action_id) {
    case "open_vote_modal":
      return await handleOpenVoteModal(action, payload, workspaceId);
    case "show_vote_results":
      return await handleShowVoteResults(action, payload, workspaceId);
    case "end_vote":
      return await handleEndVote(action, payload, workspaceId);
    default:
      logger.warn(`Unknown action`, { actionId: action.action_id });
      return {
        status: 200,
        body: {
          text: `This action (${action.action_id}) is not yet supported.`,
          response_type: "ephemeral",
        },
      };
  }
}

// Handle view submissions (modal form submissions)
async function handleViewSubmission(
  payload: SlackInteraction,
  workspaceId: string,
): Promise<InteractionResponse> {
  // This handles modal submissions
  logger.info("Handling view submission", { viewId: payload.view?.id });

  if (!payload.view) {
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "No view data found in submission.",
      },
    };
  }

  // Get the callback_id to determine what type of submission it is
  const callbackId = payload.view.callback_id;

  if (callbackId === "create_vote_submission") {
    return await handleCreateVoteSubmission(payload, workspaceId);
  } else if (callbackId === "vote_submission") {
    return await handleVoteSubmission(payload);
  } else {
    logger.warn(`Unknown view submission type`, { callbackId });
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "This submission type is not supported.",
      },
    };
  }
}
