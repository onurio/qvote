import { Workspace } from "../../node_modules/generated/index.d.ts";
import { openVoteCreationModal } from "./interactions.ts";
import { createErrorMessageBlocks, createInfoMessageBlocks, SlackBlock } from "./blocks.ts";

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
async function handleQVoteCommand(
  request: SlackRequest,
  workspace: Workspace,
): Promise<CommandResponse> {
  try {
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
    console.error("Error opening vote creation modal:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
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
