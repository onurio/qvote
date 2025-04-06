import { InteractionResponse, SlackInteraction } from "./types.ts";
import logger from "@utils/logger.ts";
import { checkAndAutoEndVote } from "./vote-auto-end.ts";
import { votesService } from "@db/prisma.ts";
// @ts-types="generated/index.d.ts"
import { Vote } from "generated/index.js";
import { createErrorResponse } from "@slack/services/interactions/vote-utils.ts";
import { NotFoundError, UnauthorizedError, ValidationError, VoteError } from "@db/errors.ts";

// Validation functions
const validateMetadata = (metadata: Record<string, unknown>): string => {
  if (!metadata.voteId || typeof metadata.voteId !== "string") {
    throw new NotFoundError("No vote ID found in submission metadata.");
  }
  return metadata.voteId;
};

const validateVoteExists = async (voteId: string) => {
  const vote = await votesService.getVoteById(voteId);
  if (!vote) {
    throw new NotFoundError("Vote not found.");
  }
  return vote;
};

const validateUserAllowed = (vote: Vote, userId: string) => {
  const allowedVoters = vote.allowedVoters as string[] | null;
  if (
    allowedVoters &&
    allowedVoters.length > 0 &&
    !allowedVoters.includes(userId)
  ) {
    throw new UnauthorizedError(
      "You are not authorized to vote in this poll. Only selected users can vote.",
    );
  }
};

const validateVoteNotEnded = (vote: Vote) => {
  if (vote.isEnded) {
    throw new ValidationError(
      "This vote has ended and is no longer accepting responses.",
    );
  }
};

const validateCredits = (
  state: Record<string, Record<string, { value?: string }>>,
  options: string[],
  creditsPerUser: number,
) => {
  let totalCredits = 0;
  for (let i = 0; i < options.length; i++) {
    const blockId = `option_${i}`;
    const actionId = `credits_${i}`;
    if (state[blockId] && state[blockId][actionId]) {
      const credits = parseInt(state[blockId][actionId].value || "0", 10) || 0;
      const sqrt = Math.sqrt(credits);
      if (credits > 0 && !Number.isInteger(sqrt)) {
        throw new ValidationError(
          "Please use only perfect square numbers (1, 4, 9, 16, 25, 36, 49, 64, 81, 100, etc.)",
        );
      }
      totalCredits += credits;
    }
  }
  if (totalCredits > creditsPerUser) {
    throw new ValidationError(
      `You've used ${totalCredits} credits, which exceeds the limit of ${creditsPerUser} credits.`,
    );
  }
  return totalCredits;
};

// Main handler function
export async function handleVoteSubmission(
  payload: SlackInteraction,
): Promise<InteractionResponse> {
  try {
    const metadata = JSON.parse(String(payload.view?.private_metadata || "{}"));
    const voteId = validateMetadata(metadata);
    const vote = await validateVoteExists(voteId);
    const userId = payload.user.id;

    validateUserAllowed(vote, userId);
    validateVoteNotEnded(vote);

    const state = payload.view!.state.values;
    const options = vote.options as string[];
    validateCredits(state, options, vote.creditsPerUser);

    // Record votes
    for (let i = 0; i < options.length; i++) {
      const blockId = `option_${i}`;
      const actionId = `credits_${i}`;
      if (state[blockId] && state[blockId][actionId]) {
        const credits = parseInt(state[blockId][actionId].value || "0", 10) || 0;
        if (credits >= 0) {
          await votesService.recordVoteResponse(vote.id, userId, i, credits);
        }
      }
    }

    await checkAndAutoEndVote(vote.id, userId);

    return {
      status: 200,
      body: {
        response_action: "clear",
      },
    };
  } catch (error) {
    logger.error("Error processing vote submission", error);

    if (error instanceof VoteError) {
      // Different response format for NotFoundError vs other errors
      if (error instanceof NotFoundError) {
        return createErrorResponse(error.message, "Not Found");
      } else {
        return {
          status: 200,
          body: {
            response_action: error.responseAction,
            errors: {
              option_0: error.message,
            },
          },
        };
      }
    }

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
