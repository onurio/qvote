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

  // Display status based on isEnded flag
  let statusInfo;
  if (vote.isEnded) {
    statusInfo = "*Status:* :checkered_flag: Voting has ended";
  } else if (vote.endTime) {
    statusInfo = `*Status:* :hourglass: Voting ends: <!date^${
      Math.floor(new Date(vote.endTime).getTime() / 1000)
    }^{date_short_pretty} at {time}|${new Date(vote.endTime).toLocaleString()}>`;
  } else {
    statusInfo = "*Status:* :hourglass: No end time set";
  }

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

  // Display credits per user and status info
  let infoText = `*Credits per user:* ${vote.creditsPerUser}\n${statusInfo}`;

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

  // Define action buttons based on vote status
  const actionElements = [];

  // Only show Vote button if voting is still open
  if (!vote.isEnded) {
    actionElements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Vote",
        emoji: true,
      },
      value: `vote_${vote.id}`,
      action_id: "open_vote_modal",
    });
  }

  // Always show Results button
  actionElements.push({
    type: "button",
    text: {
      type: "plain_text",
      text: "Results",
      emoji: true,
    },
    value: `results_${vote.id}`,
    action_id: "show_vote_results",
  });

  // Add End Vote button for creator only if vote is not ended
  if (!vote.isEnded) {
    actionElements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "End Vote",
        emoji: true,
      },
      value: `end_${vote.id}`,
      action_id: "end_vote",
      confirm: {
        title: {
          type: "plain_text",
          text: "End this vote?",
        },
        text: {
          type: "mrkdwn",
          text:
            "This will end the voting period immediately. All votes cast so far will be counted, but no new votes will be accepted. This action cannot be undone.",
        },
        confirm: {
          type: "plain_text",
          text: "End Vote",
        },
        deny: {
          type: "plain_text",
          text: "Cancel",
        },
      },
    });
  }

  blocks.push({
    type: "actions",
    elements: actionElements,
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
