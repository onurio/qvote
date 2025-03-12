import { Vote, Workspace } from "../../node_modules/generated/index.d.ts";
import { createVote } from "../../db/votes.ts";

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
// Slack block types
export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface CommandResponse {
  status: number;
  body: {
    response_type: "ephemeral" | "in_channel";
    text?: string;
    blocks?: SlackBlock[];
  };
}

// Validation has been moved to middleware/slack.ts

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
      },
    };
  }
}

// Handle the /qvote command
async function handleQVoteCommand(
  request: SlackRequest,
  workspace: Workspace,
): Promise<CommandResponse> {
  // Parse the command text
  const commandArgs = parseQVoteCommand(request.text);

  if (!commandArgs.title || commandArgs.options.length === 0) {
    // Return usage information if arguments are insufficient
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text:
          'Usage: /qvote "Title" "Option 1" "Option 2" ["Option 3"...] [--desc "Description"] [--credits 100] [--time 24h]',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*QVote Command Help*\n\nCreate a new vote with the following format:",
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                '`/qvote "Title" "Option 1" "Option 2" ["Option 3"...] [--desc "Description"] [--credits 100] [--time 24h]`',
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                "• Title and options must be in quotes\n• --desc: Optional description (in quotes)\n• --credits: Optional credits per user (default: 100)\n• --time: Optional duration (e.g., 24h, 7d)",
            },
          },
        ],
      },
    };
  }

  try {
    // Create the vote in the database
    const vote = await createVote({
      workspaceId: workspace.id,
      channelId: request.channelId,
      creatorId: request.userId,
      title: commandArgs.title,
      description: commandArgs.description,
      options: commandArgs.options,
      creditsPerUser: commandArgs.credits,
      endTime: commandArgs.endTime,
    });

    // Craft the Slack message blocks for the vote
    const blocks = createVoteBlocks(vote, workspace.botUserId);

    // Respond to the user
    return {
      status: 200,
      body: {
        response_type: "in_channel", // Make the vote visible to the channel
        blocks: blocks,
      },
    };
  } catch (error) {
    console.error("Error creating vote:", error);
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `Error creating vote: ${error instanceof Error ? error.message : String(error)}`,
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

// Create Slack blocks for displaying a vote
export function createVoteBlocks(vote: Vote, _botUserId: string) {
  const optionsText = (vote.options as unknown as string[]).map((option: string, index: number) =>
    `*${index + 1}.* ${option}`
  ).join("\n");

  const timeInfo = vote.endTime
    ? `Voting ends: <!date^${
      Math.floor(new Date(vote.endTime).getTime() / 1000)
    }^{date_short_pretty} at {time}|${new Date(vote.endTime).toLocaleString()}>`
    : "No end time set";

  // Create blocks array and filter out nulls before returning to match SlackBlock[] type
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `:ballot_box: ${vote.title}`,
        emoji: true,
      },
    },
  ];

  // Add description block if it exists
  if (vote.description) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: vote.description,
      },
    });
  }

  // Add remaining blocks
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Options:*\n${optionsText}`,
    },
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Credits per user:* ${vote.creditsPerUser}\n${timeInfo}`,
    },
  });

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "Vote",
          emoji: true,
        },
        value: `vote_${vote.id}`,
        action_id: "open_vote_modal",
      },
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "Results",
          emoji: true,
        },
        value: `results_${vote.id}`,
        action_id: "show_vote_results",
      },
    ],
  });

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Created by <@${vote.creatorId}> | Vote ID: ${vote.id}`,
      },
    ],
  });

  return blocks;
}
