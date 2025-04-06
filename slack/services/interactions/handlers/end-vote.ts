import { createResultsBlocks } from "@slack/services/blocks.ts";
import { InteractionResponse, SlackInteraction } from "../types.ts";

import logger from "@utils/logger.ts";
import { createErrorResponse, updateOriginalMessageAfterVoteEnd } from "../vote-utils.ts";
import { votesService, workspaceService } from "@db/prisma.ts";

export async function handleEndVote(
  action: NonNullable<SlackInteraction["actions"]>[number],
  payload: SlackInteraction,
  workspaceId: string,
): Promise<InteractionResponse> {
  logger.info("Handling end vote action:", { action });

  if (!action.value) {
    return createErrorResponse("No vote ID was provided.");
  }

  // Extract vote ID from the action value (format: "end_<id>")
  const voteId = action.value.replace("end_", "");

  try {
    // Get the vote from the database
    const vote = await votesService.getVoteById(voteId);

    // Check if the user is the creator of the vote
    if (vote.creatorId !== payload.user.id) {
      return createErrorResponse(
        "Only the creator of the vote can end it.",
        "Permission Denied",
      );
    }

    // End the vote in the database
    await votesService.endVote(voteId);

    // Get results to show after ending vote
    const results = await votesService.getVoteResults(voteId);

    // Get workspace token to update the original message
    const workspaceToken = await workspaceService.getWorkspaceToken(
      workspaceId,
    );

    await updateOriginalMessageAfterVoteEnd(
      results.vote,
      payload,
      workspaceToken,
    );

    // Format results for display
    const { vote: updatedVote, results: voteResults } = results;

    // Send an ephemeral message with the results
    return {
      status: 200,
      body: {
        text: `Vote "${updatedVote.title}" has been ended`,
        response_type: "ephemeral",
        blocks: createResultsBlocks(updatedVote, voteResults),
      },
    };
  } catch (error) {
    logger.error("Error ending vote:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage, "Error Ending Vote");
  }
}
