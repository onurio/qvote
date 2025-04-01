import { createErrorMessageBlocks, createVoteBlocks } from "../blocks.ts";
import { InteractionResponse, SlackInteraction } from "./types.ts";
import { createVoteCreationModalView, createVoteSuccessModalView } from "./templates.ts";
import { getWorkspaceToken } from "./workspace-utils.ts";
import logger from "@utils/logger.ts";
import { prisma, votesService } from "@db/prisma.ts";

// Handle the vote creation submission
export async function handleCreateVoteSubmission(
  payload: SlackInteraction,
  workspaceId: string,
): Promise<InteractionResponse> {
  try {
    logger.info("Handling vote creation submission");

    // Extract values from the submission
    const state = payload.view!.state.values;
    logger.debug("Submission state", state);

    const metadata = payload.view!.private_metadata
      ? JSON.parse(String(payload.view!.private_metadata))
      : {};
    logger.debug("Metadata", metadata);

    // Extract values from the form
    const title = state.vote_title.vote_title_input.value;
    const description = state.vote_description?.vote_description_input?.value || "";
    const optionsText = state.vote_options.vote_options_input.value;

    // Extract selected users from the multi_users_select
    const allowedVotersObj = state.vote_allowed_voters?.vote_allowed_voters_input;
    let allowedVoters = null;

    // The structure of selected users is different from other fields
    // For multi-select elements, the structure is different than plain_text_input
    if (allowedVotersObj && "selected_users" in allowedVotersObj) {
      // Type assertion to access selected_users
      const selectedUsers = (
        allowedVotersObj as unknown as { selected_users: string[] }
      ).selected_users;

      // Only set allowedVoters if users were actually selected
      if (selectedUsers.length > 0) {
        // Include the creator in allowed voters if specific users were selected
        if (!selectedUsers.includes(payload.user.id)) {
          selectedUsers.push(payload.user.id);
        }

        allowedVoters = selectedUsers;
        logger.debug("Selected allowed voters", allowedVoters);
      }
    }

    const creditsText = state.vote_credits?.vote_credits_input?.value || "100";

    // Validate required fields
    if (!title || !optionsText) {
      return {
        status: 200,
        body: {
          response_action: "errors",
          errors: {
            vote_title: !title ? "Title is required" : undefined,
            vote_options: !optionsText ? "At least one option is required" : undefined,
          },
        },
      };
    }

    // Parse options (split by lines)
    const options = optionsText
      .split("\n")
      .filter((option) => option.trim().length > 0);

    if (options.length < 2) {
      return {
        status: 200,
        body: {
          response_action: "errors",
          errors: {
            vote_options: "At least two options are required",
          },
        },
      };
    }

    // Parse credits
    const credits = parseInt(creditsText, 10);

    if (isNaN(credits) || credits <= 0) {
      return {
        status: 200,
        body: {
          response_action: "errors",
          errors: {
            vote_credits: "Credits must be a positive number",
          },
        },
      };
    }

    // Validate that credits is a perfect square
    const sqrt = Math.sqrt(credits);
    const isSquare = Number.isInteger(sqrt);

    if (!isSquare) {
      return {
        status: 200,
        body: {
          response_action: "errors",
          errors: {
            vote_credits:
              "Credits must be a perfect square (1, 4, 9, 16, 25, 36, 49, 64, 81, 100, etc.)",
          },
        },
      };
    }

    // Remove duration field validation

    // Create the vote in the database
    logger.info("Creating vote", {
      workspaceId,
      channelId: metadata.channelId,
      creatorId: payload.user.id,
      title,
      description,
      options,
      allowedVoters,
      creditsPerUser: credits,
      // endTime removed
    });

    const vote = await votesService.createVote({
      workspaceId,
      channelId: metadata.channelId,
      creatorId: payload.user.id,
      title,
      description,
      options,
      allowedVoters,
      creditsPerUser: credits,
      // endTime removed
    });

    logger.info("Vote created successfully", { voteId: vote.id });

    // Get the token to post a message to the channel
    const workspaceToken = await getWorkspaceToken(prisma, workspaceId);
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

    // Create the blocks for the vote message
    const blocks = JSON.stringify(createVoteBlocks(vote, ""));

    // Post the vote message to the channel
    logger.info("Posting message to channel", {
      channelId: metadata.channelId,
    });

    // First try to join the channel
    try {
      const joinResponse = await fetch(
        "https://slack.com/api/conversations.join",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${workspaceToken}`,
          },
          body: JSON.stringify({
            channel: metadata.channelId,
          }),
        },
      );

      const joinResult = await joinResponse.json();
      logger.debug("Join channel result", joinResult);
    } catch (joinError) {
      logger.warn("Failed to join channel", joinError);
      // Continue anyway, as the bot might already be in the channel
    }

    // Now post the message
    const postResponse = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${workspaceToken}`,
      },
      body: JSON.stringify({
        channel: metadata.channelId,
        blocks,
        text: `New vote: ${title}`, // Fallback text if blocks don't render
      }),
    });

    const postResult = await postResponse.json();
    logger.debug("Post message result", postResult);

    // If we couldn't post to the channel, send an ephemeral message to the user
    if (!postResult.ok) {
      logger.warn(`Failed to post message`, { error: postResult.error });

      // Try to send an ephemeral message to the user
      try {
        await fetch("https://slack.com/api/chat.postEphemeral", {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${workspaceToken}`,
          },
          body: JSON.stringify({
            channel: metadata.channelId,
            user: payload.user.id,
            text:
              `Your vote "${title}" was created, but I couldn't post it to the channel. Make sure to invite me to the channel first with /invite @QVote.`,
            blocks: createErrorMessageBlocks(
              "Vote Created - Channel Issue",
              `Your vote "${title}" was created, but I couldn't post it to the channel. Make sure to invite me to the channel first with /invite @QVote.`,
            ),
          }),
        });
      } catch (ephemeralError) {
        logger.error("Failed to send ephemeral message", ephemeralError);
      }
    }

    // For view_submission, we need to provide a proper response
    return {
      status: 200,
      body: {
        response_action: "update",
        view: createVoteSuccessModalView(title, postResult),
      },
    };
  } catch (error) {
    logger.error("Error processing vote creation", error);

    // Return an error that will be displayed in the modal
    return {
      status: 200,
      body: {
        response_action: "errors",
        errors: {
          vote_title: `Error creating vote: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      },
    };
  }
}

// Handle opening a vote creation modal
export async function openVoteCreationModal(
  triggerId: string,
  workspaceId: string,
  channelId: string,
  userId: string,
): Promise<InteractionResponse> {
  try {
    // Get workspace token
    const workspaceToken = await getWorkspaceToken(prisma, workspaceId);
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

    // Create the modal view using the template
    const view = createVoteCreationModalView(channelId, userId);

    // Open the modal with Slack API
    const response = await fetch("https://slack.com/api/views.open", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${workspaceToken}`,
      },
      body: JSON.stringify({
        trigger_id: triggerId,
        view,
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      logger.error("Error opening vote creation modal", {
        error: result.error,
      });
      return {
        status: 200,
        body: {
          text: `Error opening vote creation modal: ${result.error}`,
          response_type: "ephemeral",
          blocks: createErrorMessageBlocks(
            "Modal Error",
            `Error opening vote creation modal: ${result.error}`,
          ),
        },
      };
    }

    // Successfully opened modal
    return {
      status: 200,
      body: {},
    };
  } catch (error) {
    logger.error("Error opening vote creation modal", error);
    return {
      status: 200,
      body: {
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        response_type: "ephemeral",
        blocks: createErrorMessageBlocks(
          "Error",
          `${error instanceof Error ? error.message : String(error)}`,
        ),
      },
    };
  }
}
