import { createErrorMessageBlocks } from "../blocks.ts";
import { InteractionResponse, SlackInteraction } from "./types.ts";
import { createVoteCreationModalView, createVoteSuccessModalView } from "./templates.ts";

import logger from "@utils/logger.ts";
import { votesService, workspaceService } from "@db/prisma.ts";
import {
  createErrorResponse,
  sendResponseUrlMessage,
} from "@slack/services/interactions/vote-utils.ts";

// Handle the vote creation submission
export async function handleCreateVoteSubmission(
  payload: SlackInteraction,
  workspaceId: string,
): Promise<InteractionResponse> {
  try {
    logger.info("Handling vote creation submission");

    // Get the token to post a message to the channel
    const workspaceToken = await workspaceService.getWorkspaceToken(
      workspaceId,
    );

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

    // Extract selected conversations from multi_conversations_select
    // (which should be user IDs for direct messages)
    const allowedVotersObj = state.vote_allowed_voters?.vote_allowed_voters_input;
    let allowedVoters = null;

    // For multi-select elements, the structure is different than plain_text_input
    // For conversations select, it uses selected_conversations instead of selected_users
    if (allowedVotersObj && "selected_conversations" in allowedVotersObj) {
      // Type assertion to access selected_conversations
      const selectedUsers = (
        allowedVotersObj as unknown as { selected_conversations: string[] }
      ).selected_conversations;

      // Only set allowedVoters if users were actually selected
      if (selectedUsers.length > 0) {
        // Include the creator in allowed voters if specific users were selected
        if (!selectedUsers.includes(payload.user.id)) {
          selectedUsers.push(payload.user.id);
        }

        allowedVoters = selectedUsers;
        logger.debug(
          "Selected allowed voters (from conversations, bots excluded)",
          allowedVoters,
        );
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

    // Log the vote creation info
    logger.info("Preparing to create vote", {
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

    // Create simple blocks for checking if we can post to the channel
    // This avoids type issues with the Vote interface
    const tempBlocks = JSON.stringify([
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Creating vote: "${title}"`,
        },
      },
    ]);

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
        blocks: tempBlocks,
        text: `New vote: ${title}`, // Fallback text if blocks don't render
      }),
    });

    const postResult = await postResponse.json();
    logger.debug("Post message result", postResult);

    // If we couldn't post to the channel, we won't store the vote
    if (!postResult.ok) {
      logger.warn(`Failed to post message, not creating vote`, {
        error: postResult.error,
      });

      // First try to use the response_url if available
      if (payload.response_url) {
        const errorMessage =
          `I couldn't create your vote because I can't post messages to the channel. This usually happens when the app hasn't been added to the channel yet. Please invite me to the channel first with:\n\n\`/invite @qvote\`\n\nThen try creating your vote again.`;

        await sendResponseUrlMessage(payload.response_url, errorMessage, {
          title: "App Not in Channel",
          isError: true,
        });

        logger.info("Sent channel error via response_url");
      } // Fallback to chat.postEphemeral if response_url is not available
      else {
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
                `I couldn't create your vote because I can't post messages to the channel. Please invite me to the channel first with /invite @qvote.`,
              blocks: createErrorMessageBlocks(
                "Vote Creation Failed",
                `I couldn't create your vote because I can't post messages to the channel. Please invite me to the channel first with /invite @qvote.`,
              ),
            }),
          });
        } catch (ephemeralError) {
          logger.error("Failed to send ephemeral message", ephemeralError);
        }
      }

      // Return early without creating the vote in the database
      return {
        status: 200,
        body: {
          response_action: "update",
          view: createVoteSuccessModalView(title, { ok: false }),
        },
      };
    }

    // If the message was posted successfully, create the vote in the database
    await votesService.createVote({
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
    const workspaceToken = await workspaceService.getWorkspaceToken(
      workspaceId,
    );

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
      return createErrorResponse(
        `Error opening vote creation modal: ${result.error}`,
        "Modal Error",
      );
    }

    // Successfully opened modal
    return {
      status: 200,
      body: {},
    };
  } catch (error) {
    logger.error("Error opening vote creation modal", typeof error);
    return createErrorResponse(
      `Error opening vote creation modal: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "Modal Error",
    );
  }
}
