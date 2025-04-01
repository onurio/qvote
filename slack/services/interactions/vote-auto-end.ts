import { getWorkspaceToken } from "./workspace-utils.ts";
import logger from "@utils/logger.ts";
import { haveAllVotersVoted, updateVoteMessage } from "./vote-utils.ts";
import { prisma, votesService } from "@db/prisma.ts";

/**
 * Checks if all allowed voters have voted and ends the vote if they have
 * @param voteId The ID of the vote to check
 * @param userId The ID of the user who just voted (to make sure they're included in the count)
 */
export async function checkAndAutoEndVote(
  voteId: string,
  userId: string,
): Promise<void> {
  try {
    // Get latest vote data with all responses
    const vote = await votesService.getVoteById(voteId);

    if (!vote || vote.isEnded) {
      // Vote not found or already ended
      return;
    }

    // Check if there are allowed voters restrictions
    const allowedVoters = vote.allowedVoters as string[] | null;

    if (!allowedVoters || allowedVoters.length === 0) {
      // No allowed voters restriction
      return;
    }

    if (haveAllVotersVoted(vote, allowedVoters, userId)) {
      // End the vote automatically
      await votesService.endVote(vote.id);
      logger.info("Vote ended automatically because all participants have voted", {
        voteId: vote.id,
      });

      // Get workspace token for message updates
      const workspaceToken = await getWorkspaceToken(prisma, vote.workspaceId);
      if (!workspaceToken) {
        logger.warn("Could not get workspace token for vote message update", {
          voteId: vote.id,
        });
        return;
      }

      // Update UI message
      await updateVoteMessage(vote, workspaceToken);
    }
  } catch (error) {
    logger.error("Error in checkAndAutoEndVote", error);
  }
}
