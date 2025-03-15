import { getVoteById, recordVoteResponse } from "../../../db/votes.ts";
import { InteractionResponse, SlackInteraction } from "./types.ts";

// Handle vote submission from an existing vote
export async function handleVoteSubmission(
  payload: SlackInteraction,
): Promise<InteractionResponse> {
  // Extract metadata from the view
  const metadata = payload.view!.private_metadata
    ? JSON.parse(String(payload.view!.private_metadata))
    : {};

  if (!metadata.voteId) {
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "No vote ID found in submission metadata.",
      },
    };
  }

  try {
    // Get the vote from database
    const vote = await getVoteById(metadata.voteId);

    if (!vote) {
      return {
        status: 200,
        body: {
          response_type: "ephemeral",
          text: "Vote not found.",
        },
      };
    }

    // Extract the user's vote allocations from the state values
    const state = payload.view!.state.values;
    const options = vote.options as string[];
    const userId = payload.user.id;

    // Check if this user is allowed to vote
    const allowedVoters = vote.allowedVoters as string[] | null;
    if (allowedVoters && allowedVoters.length > 0 && !allowedVoters.includes(userId)) {
      return {
        status: 200,
        body: {
          response_action: "errors",
          errors: {
            option_0: "You are not authorized to vote in this poll. Only selected users can vote.",
          },
        },
      };
    }

    // Check if the vote has ended
    if (vote.isEnded) {
      return {
        status: 200,
        body: {
          response_action: "errors",
          errors: {
            option_0: "This vote has ended and is no longer accepting responses.",
          },
        },
      };
    }

    let totalUsedCredits = 0;

    // Process each option's credits
    for (let i = 0; i < options.length; i++) {
      const blockId = `option_${i}`;
      const actionId = `credits_${i}`;

      if (state[blockId] && state[blockId][actionId]) {
        const credits = parseInt(state[blockId][actionId].value || "0", 10) || 0;

        // Validate that credits is a perfect square
        const sqrt = Math.sqrt(credits);
        const isSquare = Number.isInteger(sqrt);

        if (credits > 0 && !isSquare) {
          // Return an error if credits is not a perfect square
          return {
            status: 200,
            body: {
              response_action: "errors",
              errors: {
                [blockId]:
                  "Please use only perfect square numbers (1, 4, 9, 16, 25, 36, 49, 64, 81, 100, etc.)",
              },
            },
          };
        }

        if (credits > 0) {
          // Record this option's votes
          await recordVoteResponse(vote.id, userId, i, credits);
          totalUsedCredits += credits;
        }
      }
    }

    // Return success response for view submission
    return {
      status: 200,
      body: {
        response_action: "clear",
      },
    };
  } catch (error) {
    console.error("Error processing vote submission:", error);

    // For view_submission, returning errors with a response_action of "errors"
    // keeps the modal open and displays the errors
    return {
      status: 200,
      body: {
        response_action: "errors",
        errors: {
          option_0: "Error processing your vote. Please try again.",
        },
      },
    };
  }
}
