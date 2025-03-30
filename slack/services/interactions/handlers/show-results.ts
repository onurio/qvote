import { getVoteResults } from "@db/votes.ts";
import { createResultsBlocks } from "@slack/services/blocks.ts";
import { InteractionResponse, SlackInteraction } from "../types.ts";
import logger from "@utils/logger.ts";
import { createErrorResponse, sendResultsViaResponseUrl } from "../vote-utils.ts";
import { prisma } from "@db/prisma.ts";

export async function handleShowVoteResults(
  action: NonNullable<SlackInteraction["actions"]>[number],
  payload: SlackInteraction,
  _workspaceId: string,
): Promise<InteractionResponse> {
  logger.info("Show vote results action:", { action });

  if (!action.value) {
    logger.error("No action value provided for vote results");
    return createErrorResponse("No vote ID was provided.", "Missing Information");
  }

  // Extract vote ID from the action value (format: "results_<id>")
  const voteId = action.value.replace("results_", "");
  logger.debug("Extracted vote ID:", voteId);

  try {
    // Get the vote results from the database
    logger.debug("Fetching vote results for ID:", voteId);
    const results = await getVoteResults(prisma, voteId);

    if (!results) {
      logger.error("No results found for vote ID:", voteId);
      return createErrorResponse("Vote results not found.", "Not Found");
    }

    // Format the results
    const { vote, results: voteResults } = results;

    if (payload.response_url) {
      await sendResultsViaResponseUrl(vote, voteResults, payload.response_url, createResultsBlocks);
    } else {
      logger.warn("No response_url found in payload");
    }

    // Return an empty 200 response to acknowledge receipt
    return { status: 200, body: {} };
  } catch (error) {
    logger.error("Error showing vote results:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage, "Error Showing Results");
  }
}
