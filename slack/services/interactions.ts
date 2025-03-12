import { getVoteById, getVoteResults, recordVoteResponse } from "../../db/votes.ts";
import { prisma } from "../../db/prisma.ts";

// Define the structure of a Slack interaction payload
export interface SlackInteraction {
  type: string;
  user: {
    id: string;
    username?: string;
    name?: string;
  };
  trigger_id: string;
  team: {
    id: string;
    domain?: string;
  };
  channel: {
    id: string;
    name?: string;
  };
  actions?: {
    action_id: string;
    block_id: string;
    value?: string;
    type: string;
    [key: string]: unknown;
  }[];
  view?: {
    id: string;
    state: {
      values: Record<string, Record<string, { value: string }>>;
    };
    private_metadata?: string;
    [key: string]: unknown;
  };
  response_url?: string;
  [key: string]: unknown;
}

// Response structure for interaction handling
// Define a type for Slack blocks
export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text?: {
      type: string;
      text: string;
      emoji?: boolean;
    };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface InteractionResponse {
  status: number;
  body: {
    response_type?: "ephemeral" | "in_channel";
    text?: string;
    blocks?: SlackBlock[];
    replace_original?: boolean;
    delete_original?: boolean;
    [key: string]: unknown;
  };
}

// Route the interaction to the appropriate handler
export async function routeSlackInteraction(
  payload: SlackInteraction,
  workspaceId: string,
): Promise<InteractionResponse> {
  console.log("Routing interaction:", payload.type);

  switch (payload.type) {
    case "block_actions":
      return await handleBlockActions(payload, workspaceId);
    case "view_submission":
      return await handleViewSubmission(payload, workspaceId);
    default:
      console.warn(`Unknown interaction type: ${payload.type}`);
      return {
        status: 200,
        body: {
          text: "This interaction type is not yet supported.",
          response_type: "ephemeral",
        },
      };
  }
}

// Handle block actions (buttons, select menus, etc.)
async function handleBlockActions(
  payload: SlackInteraction,
  workspaceId: string,
): Promise<InteractionResponse> {
  console.log("Handling block actions", payload);
  if (!payload.actions || payload.actions.length === 0) {
    return {
      status: 200,
      body: {
        text: "No action was provided.",
        response_type: "ephemeral",
      },
    };
  }

  // Get the first action
  const action = payload.actions[0];
  console.log("Handling action:", action.action_id);

  switch (action.action_id) {
    case "open_vote_modal":
      return await handleOpenVoteModal(action, payload, workspaceId);
    case "show_vote_results":
      return await handleShowVoteResults(action, payload, workspaceId);
    default:
      console.warn(`Unknown action: ${action.action_id}`);
      return {
        status: 200,
        body: {
          text: `This action (${action.action_id}) is not yet supported.`,
          response_type: "ephemeral",
        },
      };
  }
}

// Handle view submissions (modal form submissions)
async function handleViewSubmission(
  payload: SlackInteraction,
  _workspaceId: string,
): Promise<InteractionResponse> {
  // This handles modal submissions
  console.log("Handling view submission", payload.view?.id);

  if (!payload.view) {
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "No view data found in submission.",
      },
    };
  }

  // Extract metadata from the view
  const metadata = payload.view.private_metadata
    ? JSON.parse(String(payload.view.private_metadata))
    : {};

  if (!metadata.voteId) {
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "No vote ID found in submission metadata.",
      },
    };
  }

  try {
    // Get the vote from database
    const vote = await getVoteById(metadata.voteId);

    if (!vote) {
      return {
        status: 200,
        body: {
          response_type: "ephemeral",
          text: "Vote not found.",
        },
      };
    }

    // Extract the user's vote allocations from the state values
    const state = payload.view.state.values;
    const options = vote.options as string[];
    const userId = payload.user.id;
    let totalUsedCredits = 0;

    // Process each option's credits
    for (let i = 0; i < options.length; i++) {
      const blockId = `option_${i}`;
      const actionId = `credits_${i}`;

      if (state[blockId] && state[blockId][actionId]) {
        const credits = parseInt(state[blockId][actionId].value || "0", 10) || 0;

        if (credits > 0) {
          // Record this option's votes
          await recordVoteResponse(vote.id, userId, i, credits);
          totalUsedCredits += credits;
        }
      }
    }

    // Return success response
    return {
      status: 200,
      body: {},
    };
  } catch (error) {
    console.error("Error processing vote submission:", error);

    // For view_submission, returning errors with a response_action of "errors"
    // keeps the modal open and displays the errors
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

// Handle opening the vote modal
async function handleOpenVoteModal(
  action: NonNullable<SlackInteraction["actions"]>[number],
  payload: SlackInteraction,
  workspaceId: string,
): Promise<InteractionResponse> {
  if (!action.value) {
    return {
      status: 200,
      body: {
        text: "No vote ID was provided.",
        response_type: "ephemeral",
      },
    };
  }

  // Extract vote ID from the action value (format: "vote_<id>")
  const voteId = action.value.replace("vote_", "");

  try {
    // Get the vote from the database
    const vote = await getVoteById(voteId);

    if (!vote) {
      return {
        status: 200,
        body: {
          text: "Vote not found.",
          response_type: "ephemeral",
        },
      };
    }

    // Get the workspace to get the access token
    const workspaceToken = await getWorkspaceToken(workspaceId);
    if (!workspaceToken) {
      return {
        status: 200,
        body: {
          text: "Workspace not found or authentication error.",
          response_type: "ephemeral",
        },
      };
    }

    // Prepare modal view payload
    const options = vote.options as string[];
    const blocks: SlackBlock[] = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${vote.title}*`,
          emoji: true,
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
          emoji: true,
        },
      });
    }

    // Add info about quadratic voting
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Quadratic Voting*\nYou have *${vote.creditsPerUser} credits* to distribute among the options. The cost of voting increases quadratically: 1 credit = 1 vote, 4 credits = 2 votes, 9 credits = 3 votes, etc.`,
        emoji: true,
      },
    });

    blocks.push({
      type: "divider",
    });

    // Add input blocks for each option
    options.forEach((option, index) => {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Option ${index + 1}:* ${option}`,
          emoji: true,
        },
      });

      blocks.push({
        type: "input",
        block_id: `option_${index}`,
        element: {
          type: "plain_text_input",
          action_id: `credits_${index}`,
          placeholder: {
            type: "plain_text",
            text: "0",
          },
          initial_value: "0",
        },
        label: {
          type: "plain_text",
          text: "Credits",
          emoji: true,
        },
        hint: {
          type: "plain_text",
          text: "Enter the number of credits you want to allocate to this option",
          emoji: true,
        },
      } as SlackBlock);
    });

    // Open modal using Slack API
    const view = {
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
            text:
              "You have credits to distribute. Cost increases quadratically: 1 vote = 1 credit, 2 votes = 4 credits, etc.",
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

    // Add input blocks for each option directly to view.blocks
    options.forEach((option, index) => {
      view.blocks.push(
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Option ${index + 1}:* ${option}`,
          },
        },
        {
          type: "input",
          block_id: `option_${index}`,
          element: {
            type: "plain_text_input",
            action_id: `credits_${index}`,
            placeholder: {
              type: "plain_text",
              text: "0",
            },
          },
          label: {
            type: "plain_text",
            text: "Credits",
            emoji: true,
          },
        } as SlackBlock,
      );
    });

    // For debugging
    console.log(
      "Modal payload:",
      JSON.stringify(
        {
          trigger_id: payload.trigger_id,
          view,
        },
        null,
        2,
      ),
    );

    // Call the Slack API to open the modal
    const response = await fetch("https://slack.com/api/views.open", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${workspaceToken}`,
      },
      body: JSON.stringify({
        trigger_id: payload.trigger_id,
        view,
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error("Error opening modal:", result.error);
      return {
        status: 200,
        body: {
          text: `Error opening modal: ${result.error}`,
          response_type: "ephemeral",
        },
      };
    }

    // Successfully opened modal, return empty response
    return {
      status: 200,
      body: {},
    };
  } catch (error) {
    console.error("Error opening vote modal:", error);
    return {
      status: 200,
      body: {
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        response_type: "ephemeral",
      },
    };
  }
}

// Helper function to get workspace token
async function getWorkspaceToken(workspaceId: string): Promise<string | null> {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    return workspace?.accessToken || null;
  } catch (error) {
    console.error("Error getting workspace token:", error);
    return null;
  }
}

// Handle showing vote results
async function handleShowVoteResults(
  action: NonNullable<SlackInteraction["actions"]>[number],
  payload: SlackInteraction,
  _workspaceId: string,
): Promise<InteractionResponse> {
  console.log("Show vote results action:", action);

  if (!action.value) {
    console.error("No action value provided for vote results");
    return {
      status: 200,
      body: {
        text: "No vote ID was provided.",
        response_type: "ephemeral",
      },
    };
  }

  // Extract vote ID from the action value (format: "results_<id>")
  const voteId = action.value.replace("results_", "");
  console.log("Extracted vote ID:", voteId);

  try {
    // Get the vote results from the database
    console.log("Fetching vote results for ID:", voteId);
    const results = await getVoteResults(voteId);
    console.log("Retrieved results:", JSON.stringify(results, null, 2));

    if (!results) {
      console.error("No results found for vote ID:", voteId);
      return {
        status: 200,
        body: {
          text: "Vote results not found.",
          response_type: "ephemeral",
        },
      };
    }

    // Format the results
    const { vote, results: voteResults } = results;
    console.log("Vote details:", JSON.stringify(vote, null, 2));
    console.log("Vote results:", JSON.stringify(voteResults, null, 2));

    // Create blocks using the SlackBlock type
    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `:bar_chart: Results: ${vote.title}`,
          emoji: true,
        },
      },
    ];

    console.log("Created header block for results");

    // Add description if available
    if (vote.description) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: vote.description,
          emoji: true,
        },
      });
    }

    // Add quadratic voting explainer
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          "_Quadratic voting: votes = √credits. Cost increases quadratically with each vote: 1 vote = 1 credit, 2 votes = 4 credits, 3 votes = 9 credits, etc._",
        emoji: true,
      },
    });

    // Calculate total credits across all options
    const totalCredits = voteResults.reduce(
      (sum, r) => sum + r.totalCredits,
      0,
    );
    console.log("Total credits used:", totalCredits);

    let totalVotes = 0;
    // Add results section - calculate actual votes (sqrt of credits) for quadratic voting
    const resultsText = voteResults
      .map((r, i) => {
        // Calculate actual votes (square root of credits)
        const actualVotes = Math.round(Math.sqrt(r.totalCredits) * 10) / 10;

        // Calculate percentage based on votes not credits
        totalVotes = voteResults.reduce(
          (sum, r) => sum + Math.sqrt(r.totalCredits),
          0,
        );

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

    console.log("Formatted results text:", resultsText);

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: resultsText || "No votes yet.",
        emoji: true,
      },
    });

    console.log("Generated blocks:", JSON.stringify(blocks, null, 2));

    // Get the response_url from the payload
    if (payload.response_url) {
      console.log("Using response_url to send results:", payload.response_url);

      // Send the response directly to the response_url
      try {
        // Instead of sending blocks with emojis, send a simpler text response
        const message = {
          response_type: "ephemeral",
          text:
            `*Results for "${vote.title}"*\n\n${
              vote.description ? vote.description + "\n\n" : ""
            }` +
            "_Quadratic voting: votes = √credits_\n\n" +
            voteResults
              .map((r, i) => {
                const votes = Math.round(Math.sqrt(r.totalCredits) * 10) / 10;
                const percentage = totalVotes > 0
                  ? Math.round((Math.sqrt(r.totalCredits) / totalVotes) * 100)
                  : 0;
                return `*${
                  i + 1
                }.* ${r.option}: ${votes} votes (${percentage}%) - ${r.totalCredits} credits`;
              })
              .join("\n"),
          replace_original: false,
        };

        console.log(
          "Sending text response instead of blocks:",
          JSON.stringify(message, null, 2),
        );

        const slackResponse = await fetch(payload.response_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });

        const responseData = await slackResponse.text();
        console.log("Response from Slack:", responseData);
      } catch (error) {
        console.error("Error sending to response_url:", error);
      }
    } else {
      console.log("No response_url found in payload");
    }

    // Return an empty 200 response to acknowledge receipt
    const response = {
      status: 200,
      body: {},
    };

    console.log("Sending response:", JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    console.error("Error showing vote results:", error);
    return {
      status: 200,
      body: {
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        response_type: "ephemeral",
      },
    };
  }
}
