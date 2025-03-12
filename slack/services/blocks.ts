import { Vote } from "../../node_modules/generated/index.d.ts";

// Define the structure for Slack blocks
export interface SlackBlock {
  type: string;
  [key: string]: unknown;
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

  // Display credits per user and time info
  let infoText = `*Credits per user:* ${vote.creditsPerUser}\n${timeInfo}`;

  // Add information about allowed voters if restrictions exist
  const allowedVoters = vote.allowedVoters as string[] | null;
  if (allowedVoters && allowedVoters.length > 0) {
    infoText += `\n*Note:* This vote is restricted to specific users.`;
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: infoText,
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
