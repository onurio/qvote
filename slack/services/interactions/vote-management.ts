import { endVote, getVoteById, getVoteResults } from "@db/votes.ts";
import {
  createErrorMessageBlocks,
  createInfoMessageBlocks,
  createResultsBlocks,
  createVoteBlocks,
} from "@slack/services/blocks.ts";
import { InteractionResponse, SlackBlock, SlackInteraction } from "./types.ts";
import { getWorkspaceToken } from "./workspace-utils.ts";
import logger from "@utils/logger.ts";

// Handle ending a vote
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
    const vote = await getVoteById(voteId);

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

    // Get all unique user IDs that have voted
    const voterIds = new Set();
    vote.responses.forEach((response) => {
      if (response.credits > 0) {
        // Only count users who gave credits
        voterIds.add(response.userId);
      }
    });
    // Add the current voter
    voterIds.add(userId);

    // Check if all allowed voters have now voted
    const allVoted = allowedVoters.every((voterId) => voterIds.has(voterId));

    if (allVoted) {
      // End the vote automatically
      await endVote(vote.id);
      logger.info(
        "Vote ended automatically because all participants have voted",
        {
          voteId: vote.id,
        },
      );

      // Update UI message
      await updateVoteMessage(vote);
    }
  } catch (error) {
    logger.error("Error in checkAndAutoEndVote", error);
  }
}

/**
 * Updates the Slack message containing the vote to reflect current state
 * @param vote The vote to update the message for
 */
async function updateVoteMessage(vote: {
  id: string;
  workspaceId: string;
  channelId: string;
  title: string;
}): Promise<void> {
  try {
    const workspaceToken = await getWorkspaceToken(vote.workspaceId);
    if (!workspaceToken) {
      logger.warn("Could not get workspace token for vote message update", {
        voteId: vote.id,
      });
      return;
    }

    // Get updated vote with current state
    const updatedVote = await getVoteById(vote.id);
    if (!updatedVote) {
      return;
    }

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
      return;
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
      return;
    }

    // Update the message with new blocks showing updated vote state
    const updatedBlocks = JSON.stringify(createVoteBlocks(updatedVote, ""));
    const updateResponse = await fetch("https://slack.com/api/chat.update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${workspaceToken}`,
      },
      body: JSON.stringify({
        channel: vote.channelId,
        ts: voteMessage.ts,
        blocks: updatedBlocks,
        text: updatedVote.isEnded ? `Vote ended: ${vote.title}` : `Vote: ${vote.title}`,
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
    logger.error("Error updating vote message", error);
  }
}

export async function handleEndVote(
  action: NonNullable<SlackInteraction["actions"]>[number],
  payload: SlackInteraction,
  workspaceId: string,
): Promise<InteractionResponse> {
  logger.info("Handling end vote action:", { action });

  if (!action.value) {
    return {
      status: 200,
      body: {
        text: "No vote ID was provided.",
        response_type: "ephemeral",
      },
    };
  }

  // Extract vote ID from the action value (format: "end_<id>")
  const voteId = action.value.replace("end_", "");

  try {
    // Get the vote from the database
    const vote = await getVoteById(voteId);

    if (!vote) {
      return {
        status: 200,
        body: {
          text: "Vote not found.",
          response_type: "ephemeral",
          blocks: createErrorMessageBlocks("Not Found", "Vote not found."),
        },
      };
    }

    // Check if the user is the creator of the vote
    if (vote.creatorId !== payload.user.id) {
      return {
        status: 200,
        body: {
          text: "Only the creator of the vote can end it.",
          response_type: "ephemeral",
          blocks: createErrorMessageBlocks(
            "Permission Denied",
            "Only the creator of the vote can end it.",
          ),
        },
      };
    }

    // End the vote in the database
    await endVote(voteId);

    // Get results to show after ending vote
    const results = await getVoteResults(voteId);

    // Get workspace token to update the original message
    const workspaceToken = await getWorkspaceToken(workspaceId);
    if (!workspaceToken) {
      return {
        status: 200,
        body: {
          text: "Workspace not found or authentication error.",
          response_type: "ephemeral",
          blocks: createErrorMessageBlocks(
            "Authentication Error",
            "Workspace not found or authentication error.",
          ),
        },
      };
    }

    // Update the original message with the vote blocks (which will now show it as ended)
    const updatedBlocks = JSON.stringify(createVoteBlocks(results.vote, ""));

    try {
      // Need to handle the message property which might not exist in all payload types
      const messageTs = (payload as unknown as { message?: { ts: string } })
        .message?.ts;
      if (!messageTs) {
        console.warn("Could not find message timestamp in payload");
        return {
          status: 200,
          body: {
            text: "Vote has been ended, but the original message couldn't be updated.",
            response_type: "ephemeral",
            blocks: createInfoMessageBlocks(
              "Vote Ended",
              "Vote has been ended, but the original message couldn't be updated.",
            ),
          },
        };
      }

      const updateResponse = await fetch("https://slack.com/api/chat.update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${workspaceToken}`,
        },
        body: JSON.stringify({
          channel: payload.channel.id,
          ts: messageTs, // The timestamp of the original message
          blocks: updatedBlocks,
          text: `Vote ended: ${vote.title}`, // Fallback text
        }),
      });

      const updateResult = await updateResponse.json();
      console.log("Update message result:", JSON.stringify(updateResult));

      // If we couldn't update the message, log error
      if (!updateResult.ok) {
        console.warn(`Failed to update message: ${updateResult.error}`);
      }
    } catch (updateError) {
      console.error("Error updating message:", updateError);
    }

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
    console.error("Error ending vote:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 200,
      body: {
        text: `Error: ${errorMessage}`,
        response_type: "ephemeral",
        blocks: createErrorMessageBlocks("Error Ending Vote", errorMessage),
      },
    };
  }
}

// Handle showing vote results
export async function handleShowVoteResults(
  action: NonNullable<SlackInteraction["actions"]>[number],
  payload: SlackInteraction,
  _workspaceId: string,
): Promise<InteractionResponse> {
  console.log("Show vote results action:", action);

  if (!action.value) {
    console.error("No action value provided for vote results");
    return {
      status: 200,
      body: {
        text: "No vote ID was provided.",
        response_type: "ephemeral",
        blocks: createErrorMessageBlocks(
          "Missing Information",
          "No vote ID was provided.",
        ),
      },
    };
  }

  // Extract vote ID from the action value (format: "results_<id>")
  const voteId = action.value.replace("results_", "");
  console.log("Extracted vote ID:", voteId);

  try {
    // Get the vote results from the database
    console.log("Fetching vote results for ID:", voteId);
    const results = await getVoteResults(voteId);
    console.log("Retrieved results:", JSON.stringify(results, null, 2));

    if (!results) {
      console.error("No results found for vote ID:", voteId);
      return {
        status: 200,
        body: {
          text: "Vote results not found.",
          response_type: "ephemeral",
          blocks: createErrorMessageBlocks(
            "Not Found",
            "Vote results not found.",
          ),
        },
      };
    }

    // Format the results
    const { vote, results: voteResults } = results;
    console.log("Vote details:", JSON.stringify(vote, null, 2));
    console.log("Vote results:", JSON.stringify(voteResults, null, 2));

    // Create blocks using the SlackBlock type
    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `:bar_chart: Results: ${vote.title}`,
          emoji: true,
        },
      },
    ];

    console.log("Created header block for results");

    // Add description if available
    if (vote.description) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: vote.description,
          emoji: true,
        },
      });
    }

    // Add quadratic voting explainer
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          "_Quadratic voting: votes = √credits. Cost increases quadratically with each vote: 1 vote = 1 credit, 2 votes = 4 credits, 3 votes = 9 credits, etc._",
        emoji: true,
      },
    });

    // Calculate total credits across all options
    const totalCredits = voteResults.reduce(
      (sum, r) => sum + r.totalCredits,
      0,
    );
    console.log("Total credits used:", totalCredits);

    let totalVotes = 0;
    // Add results section - calculate actual votes (sqrt of credits) for quadratic voting
    const resultsText = voteResults
      .map((r, i) => {
        // Calculate actual votes (square root of credits)
        const actualVotes = Math.round(Math.sqrt(r.totalCredits) * 10) / 10;

        // Calculate percentage based on votes not credits
        totalVotes = voteResults.reduce(
          (sum, r) => sum + Math.sqrt(r.totalCredits),
          0,
        );

        const percentage = totalVotes > 0
          ? Math.round((Math.sqrt(r.totalCredits) / totalVotes) * 100)
          : 0;

        // Create visual bar based on percentage
        const barLength = Math.max(1, Math.round(percentage / 5)); // Max 20 segments (for 100%)
        const bar = "█".repeat(barLength);

        // Show both votes and credits with visual bar
        return `*${
          i + 1
        }.* ${r.option}: ${actualVotes} votes (${percentage}%)\n${bar} ${r.totalCredits} credits`;
      })
      .join("\n\n");

    console.log("Formatted results text:", resultsText);

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: resultsText || "No votes yet.",
        emoji: true,
      },
    });

    console.log("Generated blocks:", JSON.stringify(blocks, null, 2));

    // Get the response_url from the payload
    if (payload.response_url) {
      console.log("Using response_url to send results:", payload.response_url);

      // Send the response directly to the response_url
      try {
        // Use blocks for a richer display
        const message = {
          response_type: "ephemeral",
          text: `Results for "${vote.title}"`, // Fallback text
          blocks: createResultsBlocks(vote, voteResults),
          replace_original: true,
        };

        console.log(
          "Sending text response instead of blocks:",
          JSON.stringify(message, null, 2),
        );

        const slackResponse = await fetch(payload.response_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });

        console.error("Response status:", await slackResponse.json());
        const responseData = await slackResponse.text();
        console.log("Response from Slack:", responseData);
      } catch (error) {
        console.error("Error sending to response_url:", error);
      }
    } else {
      console.log("No response_url found in payload");
    }

    // Return an empty 200 response to acknowledge receipt
    const response = {
      status: 200,
      body: {},
    };

    console.log("Sending response:", JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    console.error("Error showing vote results:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 200,
      body: {
        text: `Error: ${errorMessage}`,
        response_type: "ephemeral",
        blocks: createErrorMessageBlocks("Error Showing Results", errorMessage),
      },
    };
  }
}
