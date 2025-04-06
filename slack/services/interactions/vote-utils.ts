import { createVoteBlocks } from "@slack/services/blocks.ts";
import { InteractionResponse } from "./types.ts";
import { createErrorMessageBlocks } from "../blocks.ts";
import logger from "@utils/logger.ts";
import { Vote } from "generated/index.d.ts";
import { votesService } from "@db/prisma.ts";
import { NotFoundError } from "@db/errors.ts";

// Define VoteResult type to make it shareable
export interface VoteResult {
  option: string;
  totalCredits: number;
}

/**
 * Determines if all allowed voters have cast a vote
 */
export function haveAllVotersVoted(
  vote: { responses: { userId: string; credits: number }[] },
  allowedVoters: string[],
): boolean {
  // Get all unique user IDs that have voted
  const voterIds = new Set<string>();

  vote.responses.forEach((response) => {
    if (response.credits > 0) {
      // Only count users who gave credits
      voterIds.add(response.userId);
    }
  });

  // Check if all allowed voters have now voted
  return allowedVoters.every((voterId) => voterIds.has(voterId));
}

/**
 * Finds the Slack message containing the vote in the channel history
 */
export async function findVoteMessageInChannel(
  vote: { id: string; channelId: string },
  workspaceToken: string,
): Promise<{ ts: string } | null> {
  try {
    // Find the message containing this vote in the channel
    const historyResponse = await fetch(
      `https://slack.com/api/conversations.history?channel=${vote.channelId}&limit=20`,
      {
        headers: {
          Authorization: `Bearer ${workspaceToken}`,
        },
      },
    );

    const history = await historyResponse.json();
    if (!history.ok) {
      logger.warn("Failed to get channel history", {
        error: history.error,
        voteId: vote.id,
      });
      return null;
    }

    // Look for a message that contains the vote ID
    const voteMessage = history.messages.find(
      (msg: { text?: string; blocks?: unknown; ts: string }) =>
        msg.text?.includes(vote.id) ||
        (msg.blocks && JSON.stringify(msg.blocks).includes(vote.id)),
    );

    if (!voteMessage) {
      logger.warn("Could not find vote message in channel history", {
        voteId: vote.id,
      });
      return null;
    }

    return voteMessage;
  } catch (error) {
    logger.error("Error finding vote message", error);
    return null;
  }
}

/**
 * Updates a Slack message with new content
 */
export async function updateSlackMessage(
  vote: Vote,
  channelId: string,
  messageTs: string,
  workspaceToken: string,
): Promise<void> {
  // Update the message with new blocks showing updated vote state
  const updatedBlocks = JSON.stringify(createVoteBlocks(vote, ""));

  try {
    const updateResponse = await fetch("https://slack.com/api/chat.update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${workspaceToken}`,
      },
      body: JSON.stringify({
        channel: channelId,
        ts: messageTs,
        blocks: updatedBlocks,
        text: vote.isEnded ? `Vote ended: ${vote.title}` : `Vote: ${vote.title}`,
      }),
    });

    const updateResult = await updateResponse.json();
    if (!updateResult.ok) {
      logger.warn("Failed to update vote message", {
        error: updateResult.error,
        voteId: vote.id,
      });
    }
  } catch (error) {
    logger.error("Error in API call to update message", error);
  }
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  message: string,
  title: string = "Error",
): InteractionResponse {
  return {
    status: 200,
    body: {
      text: message,
      response_type: "ephemeral",
      blocks: createErrorMessageBlocks(title, message),
    },
  };
}

/**
 * Updates the original Slack message after a vote has ended
 */
export async function updateOriginalMessageAfterVoteEnd(
  vote: Vote,
  payload: { channel: { id: string }; message?: { ts: string } },
  workspaceToken: string,
): Promise<void> {
  try {
    // Need to handle the message property which might not exist in all payload types
    const messageTs = (payload as unknown as { message?: { ts: string } })
      .message?.ts;

    if (!messageTs) {
      logger.warn("Could not find message timestamp in payload");
      return;
    }

    await updateSlackMessage(
      vote,
      payload.channel.id,
      messageTs,
      workspaceToken,
    );
  } catch (error) {
    logger.error("Error updating original message after vote end", error);
  }
}

/**
 * Updates the Slack message containing the vote to reflect current state
 */
export async function updateVoteMessage(
  vote: {
    id: string;
    workspaceId: string;
    channelId: string;
    title: string;
  },
  workspaceToken: string,
): Promise<void> {
  try {
    // Get updated vote with current state
    const updatedVote = await votesService.getVoteById(vote.id);

    const voteMessage = await findVoteMessageInChannel(vote, workspaceToken);
    if (!voteMessage) {
      return;
    }

    await updateSlackMessage(
      updatedVote,
      vote.channelId,
      voteMessage.ts,
      workspaceToken,
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      logger.warn("Vote not found when trying to update message", { voteId: vote.id });
      return;
    }
    logger.error("Error updating vote message", error);
  }
}

/**
 * Sends vote results via the Slack response_url
 */
export async function sendResultsViaResponseUrl(
  vote: Vote,
  voteResults: VoteResult[],
  responseUrl: string,
  createResultsBlocks: (
    vote: Vote,
    results: VoteResult[],
  ) => Record<string, unknown>[],
): Promise<void> {
  try {
    // Use blocks for a richer display
    const message = {
      response_type: "ephemeral",
      text: `Results for "${vote.title}"`, // Fallback text
      blocks: createResultsBlocks(vote, voteResults),
      replace_original: false,
    };

    logger.debug("Sending results to response_url:", responseUrl);

    const slackResponse = await fetch(responseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const responseData = await slackResponse.text();
    logger.debug("Response from Slack:", responseData);
  } catch (error) {
    logger.error("Error sending to response_url:", error);
  }
}
