/**
 * This module contains UI templates for Slack modals and message blocks.
 * Keeps the UI definitions separate from the handler logic.
 */
import { SlackModalView } from "./slack-block-types.ts";

/**
 * Creates a vote creation modal view object
 */
export function createVoteCreationModalView(
  channelId: string,
  userId: string,
): SlackModalView {
  return {
    type: "modal",
    callback_id: "create_vote_submission",
    title: {
      type: "plain_text",
      text: "Create Vote",
      emoji: true,
    },
    submit: {
      type: "plain_text",
      text: "Create",
      emoji: true,
    },
    close: {
      type: "plain_text",
      text: "Cancel",
      emoji: true,
    },
    blocks: [
      {
        type: "input",
        block_id: "vote_title",
        element: {
          type: "plain_text_input",
          action_id: "vote_title_input",
          placeholder: {
            type: "plain_text",
            text: "Enter vote title",
          },
        },
        label: {
          type: "plain_text",
          text: "Title",
          emoji: true,
        },
      },
      {
        type: "input",
        block_id: "vote_description",
        optional: true,
        element: {
          type: "plain_text_input",
          action_id: "vote_description_input",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "Optional description",
          },
        },
        label: {
          type: "plain_text",
          text: "Description",
          emoji: true,
        },
      },
      {
        type: "input",
        block_id: "vote_options",
        element: {
          type: "plain_text_input",
          action_id: "vote_options_input",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "Enter each option on a new line",
          },
        },
        label: {
          type: "plain_text",
          text: "Options",
          emoji: true,
        },
      },
      {
        type: "input",
        block_id: "vote_allowed_voters",
        optional: true,
        element: {
          type: "multi_conversations_select",
          action_id: "vote_allowed_voters_input",
          placeholder: {
            type: "plain_text",
            text: "Select users allowed to vote",
            emoji: true,
          },
          filter: {
            include: ["im"],
            exclude_bot_users: true,
          },
        },
        label: {
          type: "plain_text",
          text: "Allowed Voters",
          emoji: true,
        },
        hint: {
          type: "plain_text",
          text: "Leave empty to allow everyone to vote",
          emoji: true,
        },
      },
      {
        type: "input",
        block_id: "vote_credits",
        optional: true,
        element: {
          type: "plain_text_input",
          action_id: "vote_credits_input",
          placeholder: {
            type: "plain_text",
            text: "100",
          },
          initial_value: "100",
        },
        label: {
          type: "plain_text",
          text: "Credits per User",
          emoji: true,
        },
        hint: {
          type: "plain_text",
          text: "Must be a perfect square (1, 4, 9, 16, 25, 36, 49, 64, 81, 100, etc.)",
          emoji: true,
        },
      },
    ],
    private_metadata: JSON.stringify({
      channelId,
      userId,
    }),
  };
}

/**
 * Creates a voting modal view object
 */
export function createVotingModalView(vote: {
  id: string;
  title: string;
  description?: string | null;
  creditsPerUser: number;
  creditsUsed?: number;
  options: string[];
  previousVotes?: Array<{
    optionIndex: number;
    credits: number;
  }>;
}): SlackModalView {
  const options = vote.options as string[];

  const view: SlackModalView = {
    type: "modal",
    callback_id: "vote_submission",
    title: {
      type: "plain_text",
      text: "Vote",
      emoji: true,
    },
    submit: {
      type: "plain_text",
      text: "Submit",
      emoji: true,
    },
    close: {
      type: "plain_text",
      text: "Cancel",
      emoji: true,
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${vote.title}*${vote.description ? `\n${vote.description}` : ""}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: vote.creditsUsed !== undefined
            ? `You have *${vote.creditsPerUser}* total credits to distribute (${vote.creditsUsed} used, ${
              vote.creditsPerUser - vote.creditsUsed
            } remaining). Cost increases quadratically: 1 vote = 1 credit, 2 votes = 4 credits, etc. *You must use perfect square numbers only* (1, 4, 9, 16, 25, 36, etc.).`
            : `You have *${vote.creditsPerUser}* credits to distribute. Cost increases quadratically: 1 vote = 1 credit, 2 votes = 4 credits, etc. *You must use perfect square numbers only* (1, 4, 9, 16, 25, 36, etc.).`,
        },
      },
      {
        type: "divider",
      },
    ],
    private_metadata: JSON.stringify({
      voteId: vote.id,
    }),
  };

  // Add input blocks for each option
  for (let index = 0; index < options.length; index++) {
    const option = options[index];

    // Add section for the option
    view.blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Option ${index + 1}:* ${option}`,
      },
    });

    // Add input block for the option
    view.blocks.push({
      type: "input",
      block_id: `option_${index}`,
      element: {
        type: "plain_text_input",
        action_id: `credits_${index}`,
        placeholder: {
          type: "plain_text",
          text: "0",
        },
        initial_value: vote.previousVotes
          ? String(
            vote.previousVotes.find((v) => v.optionIndex === index)
              ?.credits || "0",
          )
          : "0",
      },
      label: {
        type: "plain_text",
        text: "Credits",
        emoji: true,
      },
      hint: {
        type: "plain_text",
        text: "Use perfect squares only (1, 4, 9, 16, 25, 36, 49, 64, 81, 100, etc.)",
        emoji: true,
      },
    });
  }

  return view;
}

/**
 * Creates a success modal view after vote creation
 */
export function createVoteSuccessModalView(
  title: string,
  postResult: { ok: boolean },
): SlackModalView {
  return {
    type: "modal",
    title: {
      type: "plain_text",
      text: postResult.ok ? "Success" : "Action Required",
      emoji: true,
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: postResult.ok
            ? `:white_check_mark: Vote "${title}" created successfully!`
            : `:warning: Vote "${title}" created, but not posted`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: postResult.ok
            ? "The vote has been posted to the channel."
            : "The vote was created but *could not be posted to the channel*. You need to invite the bot to the channel first with `/invite @qvote`, then create a new vote.",
        },
      },
    ],
  };
}
