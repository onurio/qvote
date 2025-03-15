import { endVote, getVoteById, getVoteResults } from "../../../db/votes.ts";
import { createVoteBlocks } from "../blocks.ts";
import { InteractionResponse, SlackBlock, SlackInteraction } from "./types.ts";
import { getWorkspaceToken } from "./workspace-utils.ts";

// Handle ending a vote
export async function handleEndVote(
  action: NonNullable<SlackInteraction["actions"]>[number],
  payload: SlackInteraction,
  workspaceId: string,
): Promise<InteractionResponse> {
  console.log("Handling end vote action:", action);

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
        },
      };
    }

    // Update the original message with the vote blocks (which will now show it as ended)
    const updatedBlocks = JSON.stringify(createVoteBlocks(results.vote, ""));

    try {
      // Need to handle the message property which might not exist in all payload types
      const messageTs = (payload as unknown as { message?: { ts: string } }).message?.ts;
      if (!messageTs) {
        console.warn("Could not find message timestamp in payload");
        return {
          status: 200,
          body: {
            text: "Vote has been ended, but the original message couldn't be updated.",
            response_type: "ephemeral",
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

    // Calculate total votes (square root of credits) for quadratic voting
    const totalVotes = voteResults.reduce(
      (sum, r) => sum + Math.sqrt(r.totalCredits),
      0,
    );

    // Format results text
    const resultsText = voteResults
      .map((r, i) => {
        // Calculate actual votes (square root of credits)
        const actualVotes = Math.round(Math.sqrt(r.totalCredits) * 10) / 10;
        const percentage = totalVotes > 0
          ? Math.round((Math.sqrt(r.totalCredits) / totalVotes) * 100)
          : 0;

        return `*${
          i + 1
        }.* ${r.option}: ${actualVotes} votes (${percentage}%) - ${r.totalCredits} credits`;
      })
      .join("\n");

    // Send an ephemeral message with the results
    return {
      status: 200,
      body: {
        text: `:checkered_flag: *Vote "${updatedVote.title}" has been ended*\n\n${
          resultsText || "No votes were cast."
        }`,
        response_type: "ephemeral",
      },
    };
  } catch (error) {
    console.error("Error ending vote:", error);
    return {
      status: 200,
      body: {
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        response_type: "ephemeral",
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
        // Instead of sending blocks with emojis, send a simpler text response
        const message = {
          response_type: "ephemeral",
          text:
            `*Results for "${vote.title}"*\n\n${
              vote.description ? vote.description + "\n\n" : ""
            }` +
            "_Quadratic voting: votes = √credits_\n\n" +
            voteResults
              .map((r, i) => {
                const votes = Math.round(Math.sqrt(r.totalCredits) * 10) / 10;
                const percentage = totalVotes > 0
                  ? Math.round((Math.sqrt(r.totalCredits) / totalVotes) * 100)
                  : 0;
                return `*${
                  i + 1
                }.* ${r.option}: ${votes} votes (${percentage}%) - ${r.totalCredits} credits`;
              })
              .join("\n"),
          replace_original: false,
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
    return {
      status: 200,
      body: {
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        response_type: "ephemeral",
      },
    };
  }
}
