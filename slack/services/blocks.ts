import { Vote } from "generated/index.d.ts";

// Define the structure for Slack blocks
export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

// Create Slack blocks for displaying a vote
export function createVoteBlocks(vote: Vote, _botUserId: string) {
  const optionsText = (vote.options as unknown as string[])
    .map((option: string, index: number) => `*${index + 1}.* ${option}`)
    .join("\n");

  // Display status based on isEnded flag
  const statusInfo = vote.isEnded
    ? "*Status:* :checkered_flag: Voting has ended"
    : "*Status:* :hourglass: Vote in progress";

  // Create blocks array and filter out nulls before returning to match SlackBlock[] type
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `:ballot_box: ${vote.title}`,
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
      },
      value: `vote_${vote.id}`,
      action_id: "open_vote_modal",
    });
  }

  // Only show Results button if vote has ended
  if (vote.isEnded) {
    actionElements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Results",
      },
      value: `results_${vote.id}`,
      action_id: "show_vote_results",
    });
  }

  // Add End Vote button for creator only if vote is not ended
  if (!vote.isEnded) {
    actionElements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "End Vote",
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

/**
 * Creates standard message blocks for success messages
 */
export function createSuccessMessageBlocks(
  title: string,
  message: string,
): SlackBlock[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `✅ ${title}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: message,
      },
    },
  ];
}

/**
 * Creates standard message blocks for error messages
 */
export function createErrorMessageBlocks(
  title: string,
  message: string,
): SlackBlock[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `❌ ${title}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: message,
      },
    },
  ];
}

/**
 * Creates standard message blocks for info/notice messages
 */
export function createInfoMessageBlocks(
  title: string,
  message: string,
): SlackBlock[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `ℹ️ ${title}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: message,
      },
    },
  ];
}

/**
 * Creates standard message blocks for results
 */
export function createResultsBlocks(
  vote: Vote,
  voteResults: { option: string; totalCredits: number }[],
): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📊 Results: ${vote.title}`,
      },
    },
  ];

  // Add description if available
  if (vote.description) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: vote.description,
      },
    });
  }

  // Add quadratic voting explainer
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        "_Quadratic voting: votes = √credits. Cost increases quadratically with each vote: 1 vote = 1 credit, 2 votes = 4 credits, etc._",
    },
  });

  // Calculate total votes (square root of credits)
  const totalVotes = voteResults.reduce(
    (sum, r) => sum + Math.sqrt(r.totalCredits),
    0,
  );

  // Format results
  const resultsText = voteResults
    .map((r, i) => {
      // Calculate actual votes (square root of credits)
      const actualVotes = Math.round(Math.sqrt(r.totalCredits) * 10) / 10;
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

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: resultsText || "No votes were cast.",
    },
  });

  return blocks;
}
