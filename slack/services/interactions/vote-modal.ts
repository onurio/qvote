import { InteractionResponse, SlackInteraction } from "./types.ts";
import { createVotingModalView } from "./templates.ts";

import logger from "@utils/logger.ts";
import { votesService, workspaceService } from "@db/prisma.ts";
import { createErrorResponse } from "@slack/services/interactions/vote-utils.ts";
import { NotFoundError } from "@db/errors.ts";

// Handle opening the vote modal
export async function handleOpenVoteModal(
  action: NonNullable<SlackInteraction["actions"]>[number],
  payload: SlackInteraction,
  workspaceId: string,
): Promise<InteractionResponse> {
  if (!action.value) {
    return createErrorResponse(
      "No vote ID was provided.",
      "Missing Information",
    );
  }

  // Extract vote ID from the action value (format: "vote_<id>")
  const voteId = action.value.replace("vote_", "");

  try {
    // Get the vote from the database
    const vote = await votesService.getVoteById(voteId);

    // Check if the vote has ended
    if (vote.isEnded) {
      return createErrorResponse(
        "This vote has ended and is no longer accepting responses. You can still view the results.",
        "Vote Ended",
      );
    }

    // Get the workspace to get the access token
    const workspaceToken = await workspaceService.getWorkspaceToken(
      workspaceId,
    );

    // Create the voting modal view using the template
    // Get any previous votes by this user
    const userResponses = vote.responses.filter(
      (response: { userId: string }) => response.userId === payload.user.id,
    );
    const userCredits = userResponses.reduce(
      (sum: number, response: { credits: number }) => sum + response.credits,
      0,
    );

    // Cast the options to string[] as it comes from the database as Json
    const view = createVotingModalView({
      id: vote.id,
      title: vote.title,
      description: vote.description,
      creditsPerUser: vote.creditsPerUser,
      creditsUsed: userCredits,
      options: vote.options as string[],
      previousVotes: userResponses,
    });

    // For debugging
    logger.debug("Modal payload", {
      trigger_id: payload.trigger_id,
      view,
    });

    // Call the Slack API to open the modal
    const response = await fetch("https://slack.com/api/views.open", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${workspaceToken}`,
      },
      body: JSON.stringify({
        trigger_id: payload.trigger_id,
        view,
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      logger.error("Error opening modal", { error: result.error });
      return createErrorResponse(
        `Error opening modal: ${result.error}`,
        "Modal Error",
      );
    }

    // Successfully opened modal, return empty response
    return {
      status: 200,
      body: {},
    };
  } catch (error) {
    logger.error("Error opening vote modal", error);

    if (error instanceof NotFoundError) {
      return createErrorResponse(error.message, "Not Found");
    }

    return createErrorResponse(
      `Error opening vote modal: ${error instanceof Error ? error.message : String(error)}`,
      "Modal Error",
    );
  }
}
