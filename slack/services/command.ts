import { Workspace } from "generated/index.d.ts";
import { openVoteCreationModal } from "./interactions.ts";
import { createErrorMessageBlocks, createInfoMessageBlocks, SlackBlock } from "./blocks.ts";
import logger from "@utils/logger.ts";
import { postToSlackApi } from "@utils/http-client.ts";
import { sanitizeUserError } from "@utils/error-sanitization.ts";

/**
 * Try to join a channel
 * @param channelId The ID of the channel to join
 * @param workspaceToken The workspace token for API access
 * @returns An object with success and error properties
 */
export async function joinChannel(
  channelId: string,
  workspaceToken: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info("Attempting to join channel", { channelId });

    const joinResponse = await postToSlackApi(
      "https://slack.com/api/conversations.join",
      {
        channel: channelId,
      },
      {
        Authorization: `Bearer ${workspaceToken}`,
      },
    );

    const joinResult = await joinResponse.json();

    // Note: If we're already in the channel, Slack will return { ok: true, already_in_channel: true }
    if (!joinResult.ok) {
      logger.warn("Failed to join channel", { error: joinResult.error });
      return { success: false, error: joinResult.error };
    }

    return { success: true };
  } catch (error) {
    logger.error("Error joining channel", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Define the structure of a Slack slash command request
export interface SlackRequest {
  command: string;
  text: string;
  responseUrl: string;
  teamId: string;
  channelId: string;
  userId: string;
  triggerId: string;
}

// Response structure for command handling
export interface CommandResponse {
  status: number;
  body?: {
    response_type: "ephemeral" | "in_channel";
    text?: string; // Fallback text for clients that don't support blocks
    blocks?: SlackBlock[];
  };
}

// Route the command to the appropriate handler
export async function routeSlackCommand(
  request: SlackRequest,
  workspace: Workspace,
): Promise<CommandResponse> {
  if (request.command === "/qvote") {
    return await handleQVoteCommand(request, workspace);
  } else {
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "Unknown command. Currently only /qvote is supported.",
        blocks: createInfoMessageBlocks(
          "Unknown Command",
          "Currently only `/qvote` is supported.",
        ),
      },
    };
  }
}

// Handle the /qvote command
export async function handleQVoteCommand(
  request: SlackRequest,
  workspace: Workspace,
): Promise<CommandResponse> {
  // Check if the command is a help request
  if (request.text.trim().toLowerCase() === "help") {
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "QVote Help - Create and manage quadratic votes in your Slack workspace",
        blocks: createInfoMessageBlocks(
          "QVote Help",
          "QVote allows you to create and manage quadratic votes in your Slack workspace.\n\n" +
            "*Commands:*\n" +
            "• `/qvote` - Opens the vote creation modal where you can create a new vote\n" +
            "• `/qvote help` - Shows this help message\n\n" +
            "When creating a vote, you can:\n" +
            "• Set a title and description\n" +
            "• Add multiple voting options\n" +
            "• Set the available voting credits\n" +
            "• Set an auto-close time\n\n" +
            "For more information, visit our website or contact support.",
        ),
      },
    };
  }

  try {
    // Try to join the channel before opening the modal
    const joinResult = await joinChannel(request.channelId, workspace.accessToken);

    // If we couldn't join the channel, it's likely a permission issue
    if (!joinResult.success) {
      // Only show an error if we couldn't join for a reason other than already_in_channel
      if (
        joinResult.error &&
        joinResult.error !== "already_in_channel" &&
        joinResult.error !== "method_not_supported_for_channel_type"
      ) {
        // For most errors, suggest inviting the bot
        const message =
          "I couldn't join this channel. Please add me with /invite @qvote, then try again.";

        logger.warn("Failed to join channel", {
          error: joinResult.error,
          channel: request.channelId,
        });

        return {
          status: 200,
          body: {
            response_type: "ephemeral",
            text: message,
            blocks: createErrorMessageBlocks("Cannot Join Channel", message),
          },
        };
      }

      // For already_in_channel we don't need to show an error
      logger.info("Already in channel or private channel type", { channel: request.channelId });
    } else {
      logger.info("Successfully joined channel", { channel: request.channelId });
    }

    // Open a modal for the user to enter vote details
    const modalResponse = await openVoteCreationModal(
      request.triggerId,
      workspace.id,
      request.channelId,
      request.userId,
    );

    // If there was an error opening the modal, return it to the user
    if (modalResponse.body.text) {
      return {
        status: modalResponse.status,
        body: {
          response_type: "ephemeral",
          text: modalResponse.body.text as string,
          blocks: createErrorMessageBlocks(
            "Error",
            modalResponse.body.text as string,
          ),
        },
      };
    }

    // Modal opened successfully, return empty ephemeral message
    return {
      status: 200,
    };
  } catch (error) {
    logger.error("Error opening vote creation modal:", error);
    const errorMessage = sanitizeUserError(error, "vote creation modal");
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `Error: ${errorMessage}`,
        blocks: createErrorMessageBlocks(
          "Error Opening Vote Modal",
          errorMessage,
        ),
      },
    };
  }
}

// Parse the command text into structured data
export function parseQVoteCommand(text: string) {
  // Default values
  const result = {
    title: "",
    options: [] as string[],
    description: "",
    credits: 100,
    endTime: null as Date | null,
  };

  // Split by quoted arguments
  const matches = [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

  if (matches.length === 0) {
    return result; // No arguments
  }

  // First match is title, the rest are options (for now)
  result.title = matches[0];
  if (matches.length > 1) {
    result.options = matches.slice(1);
  }

  // Extract special flags
  if (text.includes("--desc")) {
    const descMatch = text.match(/--desc\s+"([^"]+)"/);
    if (descMatch && descMatch[1]) {
      result.description = descMatch[1];
      // Remove this option from the options array if it was caught there
      result.options = result.options.filter((opt) => opt !== descMatch[1]);
    }
  }

  if (text.includes("--credits")) {
    const creditsMatch = text.match(/--credits\s+(\d+)/);
    if (creditsMatch && creditsMatch[1]) {
      result.credits = parseInt(creditsMatch[1], 10);
    }
  }

  if (text.includes("--time")) {
    const timeMatch = text.match(/--time\s+(\d+)([hd])/);
    if (timeMatch && timeMatch[1] && timeMatch[2]) {
      const value = parseInt(timeMatch[1], 10);
      const unit = timeMatch[2];

      const endTime = new Date();
      if (unit === "h") {
        endTime.setHours(endTime.getHours() + value);
      } else if (unit === "d") {
        endTime.setDate(endTime.getDate() + value);
      }

      result.endTime = endTime;
    }
  }

  return result;
}
