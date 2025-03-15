import {
  createVote,
  endVote,
  getVoteById,
  getVoteResults,
  recordVoteResponse,
} from "../../db/votes.ts";
import { prisma } from "../../db/prisma.ts";
import { createVoteBlocks } from "./blocks.ts";

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
    case "end_vote":
      return await handleEndVote(action, payload, workspaceId);
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
  workspaceId: string,
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

  // Get the callback_id to determine what type of submission it is
  const callbackId = payload.view.callback_id;

  if (callbackId === "create_vote_submission") {
    return await handleCreateVoteSubmission(payload, workspaceId);
  } else if (callbackId === "vote_submission") {
    return await handleVoteSubmission(payload);
  } else {
    console.warn(`Unknown view submission type: ${callbackId}`);
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "This submission type is not supported.",
      },
    };
  }
}

// Handle vote submission from an existing vote
async function handleVoteSubmission(
  payload: SlackInteraction,
): Promise<InteractionResponse> {
  // Extract metadata from the view
  const metadata = payload.view!.private_metadata
    ? JSON.parse(String(payload.view!.private_metadata))
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
    const state = payload.view!.state.values;
    const options = vote.options as string[];
    const userId = payload.user.id;

    // Check if this user is allowed to vote
    const allowedVoters = vote.allowedVoters as string[] | null;
    if (allowedVoters && allowedVoters.length > 0 && !allowedVoters.includes(userId)) {
      return {
        status: 200,
        body: {
          response_action: "errors",
          errors: {
            option_0: "You are not authorized to vote in this poll. Only selected users can vote.",
          },
        },
      };
    }

    // Check if the vote has ended
    if (vote.isEnded) {
      return {
        status: 200,
        body: {
          response_action: "errors",
          errors: {
            option_0: "This vote has ended and is no longer accepting responses.",
          },
        },
      };
    }

    let totalUsedCredits = 0;

    // Process each option's credits
    for (let i = 0; i < options.length; i++) {
      const blockId = `option_${i}`;
      const actionId = `credits_${i}`;

      if (state[blockId] && state[blockId][actionId]) {
        const credits = parseInt(state[blockId][actionId].value || "0", 10) || 0;

        // Validate that credits is a perfect square
        const sqrt = Math.sqrt(credits);
        const isSquare = Number.isInteger(sqrt);

        if (credits > 0 && !isSquare) {
          // Return an error if credits is not a perfect square
          return {
            status: 200,
            body: {
              response_action: "errors",
              errors: {
                [blockId]:
                  "Please use only perfect square numbers (1, 4, 9, 16, 25, 36, 49, 64, 81, 100, etc.)",
              },
            },
          };
        }

        if (credits > 0) {
          // Record this option's votes
          await recordVoteResponse(vote.id, userId, i, credits);
          totalUsedCredits += credits;
        }
      }
    }

    // Return success response for view submission
    return {
      status: 200,
      body: {
        response_action: "clear",
      },
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

// Handle the vote creation submission
async function handleCreateVoteSubmission(
  payload: SlackInteraction,
  workspaceId: string,
): Promise<InteractionResponse> {
  try {
    console.log("Handling vote creation submission");

    // Extract values from the submission
    const state = payload.view!.state.values;
    console.log("Submission state:", JSON.stringify(state));

    const metadata = payload.view!.private_metadata
      ? JSON.parse(String(payload.view!.private_metadata))
      : {};
    console.log("Metadata:", JSON.stringify(metadata));

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
      const selectedUsers =
        (allowedVotersObj as unknown as { selected_users: string[] }).selected_users;
      allowedVoters = selectedUsers;
      console.log("Selected allowed voters:", allowedVoters);
    }

    const creditsText = state.vote_credits?.vote_credits_input?.value || "100";
    const durationText = state.vote_duration?.vote_duration_input?.value || "24h";

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
    const options = optionsText.split("\n").filter((option) => option.trim().length > 0);

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

    // Parse duration (e.g., 24h, 7d)
    const timeMatch = durationText.match(/(\d+)([hd])/);
    let endTime: Date | null = null;

    if (timeMatch && timeMatch[1] && timeMatch[2]) {
      const value = parseInt(timeMatch[1], 10);
      const unit = timeMatch[2];

      endTime = new Date();
      if (unit === "h") {
        endTime.setHours(endTime.getHours() + value);
      } else if (unit === "d") {
        endTime.setDate(endTime.getDate() + value);
      }
    } else {
      return {
        status: 200,
        body: {
          response_action: "errors",
          errors: {
            vote_duration: "Invalid duration format. Use format like '24h' or '7d'",
          },
        },
      };
    }

    // Create the vote in the database
    console.log("Creating vote with:", {
      workspaceId,
      channelId: metadata.channelId,
      creatorId: payload.user.id,
      title,
      description,
      options,
      allowedVoters,
      creditsPerUser: credits,
      endTime: endTime?.toISOString(),
    });

    const vote = await createVote({
      workspaceId,
      channelId: metadata.channelId,
      creatorId: payload.user.id,
      title,
      description,
      options,
      allowedVoters,
      creditsPerUser: credits,
      endTime,
    });

    console.log("Vote created successfully:", vote.id);

    // Get the token to post a message to the channel
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

    // Create the blocks for the vote message
    const blocks = JSON.stringify(createVoteBlocks(vote, ""));

    // Post the vote message to the channel
    console.log("Posting message to channel:", metadata.channelId);

    // First try to join the channel
    try {
      const joinResponse = await fetch("https://slack.com/api/conversations.join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${workspaceToken}`,
        },
        body: JSON.stringify({
          channel: metadata.channelId,
        }),
      });

      const joinResult = await joinResponse.json();
      console.log("Join channel result:", JSON.stringify(joinResult));
    } catch (joinError) {
      console.warn("Failed to join channel:", joinError);
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
    console.log("Post message result:", JSON.stringify(postResult));

    // If we couldn't post to the channel, send an ephemeral message to the user
    if (!postResult.ok) {
      console.warn(`Failed to post message: ${postResult.error}`);

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
          }),
        });
      } catch (ephemeralError) {
        console.error("Failed to send ephemeral message:", ephemeralError);
      }
    }

    // For view_submission, we need to provide a proper response
    return {
      status: 200,
      body: {
        response_action: "update",
        view: {
          type: "modal",
          title: {
            type: "plain_text",
            text: "Success",
            emoji: true,
          },
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `:white_check_mark: Vote "${title}" created successfully!`,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: postResult.ok
                  ? "The vote has been posted to the channel."
                  : "The vote was created but couldn't be posted to the channel. Make sure to invite the bot to the channel with `/invite @QVote`.",
              },
            },
          ],
        },
      },
    };
  } catch (error) {
    console.error("Error processing vote creation:", error);

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

    // Check if the vote has ended
    if (vote.isEnded) {
      return {
        status: 200,
        body: {
          text:
            "This vote has ended and is no longer accepting responses. You can still view the results.",
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
          `*Quadratic Voting*\nYou have *${vote.creditsPerUser} credits* to distribute among the options. The cost of voting increases quadratically: 1 credit = 1 vote, 4 credits = 2 votes, 9 credits = 3 votes, etc. *You must use perfect square numbers only* (1, 4, 9, 16, 25, 36, etc.).`,
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
              "You have credits to distribute. Cost increases quadratically: 1 vote = 1 credit, 2 votes = 4 credits, etc. *You must use perfect square numbers only* (1, 4, 9, 16, 25, 36, etc.).",
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
          hint: {
            type: "plain_text",
            text: "Use perfect squares only (1, 4, 9, 16, 25, 36, 49, 64, 81, 100, etc.)",
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

// Handle ending a vote
async function handleEndVote(
  action: NonNullable<SlackInteraction["actions"]>[number],
  payload: SlackInteraction,
  workspaceId: string,
): Promise<InteractionResponse> {
  console.log("Handling end vote action:", action);

  if (!action.value) {
    return {
      status: 200,
      body: {
        text: "No vote ID was provided.",
        response_type: "ephemeral",
      },
    };
  }

  // Extract vote ID from the action value (format: "end_<id>")
  const voteId = action.value.replace("end_", "");

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

    // Check if the user is the creator of the vote
    if (vote.creatorId !== payload.user.id) {
      return {
        status: 200,
        body: {
          text: "Only the creator of the vote can end it.",
          response_type: "ephemeral",
        },
      };
    }

    // End the vote in the database
    await endVote(voteId);

    // Get results to show after ending vote
    const results = await getVoteResults(voteId);

    // Get workspace token to update the original message
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

    // Update the original message with the vote blocks (which will now show it as ended)
    const updatedBlocks = JSON.stringify(createVoteBlocks(results.vote, ""));

    try {
      // Need to handle the message property which might not exist in all payload types
      const messageTs = (payload as unknown as { message?: { ts: string } }).message?.ts;
      if (!messageTs) {
        console.warn("Could not find message timestamp in payload");
        return {
          status: 200,
          body: {
            text: "Vote has been ended, but the original message couldn't be updated.",
            response_type: "ephemeral",
          },
        };
      }

      const updateResponse = await fetch("https://slack.com/api/chat.update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${workspaceToken}`,
        },
        body: JSON.stringify({
          channel: payload.channel.id,
          ts: messageTs, // The timestamp of the original message
          blocks: updatedBlocks,
          text: `Vote ended: ${vote.title}`, // Fallback text
        }),
      });

      const updateResult = await updateResponse.json();
      console.log("Update message result:", JSON.stringify(updateResult));

      // If we couldn't update the message, log error
      if (!updateResult.ok) {
        console.warn(`Failed to update message: ${updateResult.error}`);
      }
    } catch (updateError) {
      console.error("Error updating message:", updateError);
    }

    // Format results for display
    const { vote: updatedVote, results: voteResults } = results;

    // Calculate total votes (square root of credits) for quadratic voting
    const totalVotes = voteResults.reduce(
      (sum, r) => sum + Math.sqrt(r.totalCredits),
      0,
    );

    // Format results text
    const resultsText = voteResults
      .map((r, i) => {
        // Calculate actual votes (square root of credits)
        const actualVotes = Math.round(Math.sqrt(r.totalCredits) * 10) / 10;
        const percentage = totalVotes > 0
          ? Math.round((Math.sqrt(r.totalCredits) / totalVotes) * 100)
          : 0;

        return `*${
          i + 1
        }.* ${r.option}: ${actualVotes} votes (${percentage}%) - ${r.totalCredits} credits`;
      })
      .join("\n");

    // Send an ephemeral message with the results
    return {
      status: 200,
      body: {
        text: `:checkered_flag: *Vote "${updatedVote.title}" has been ended*\n\n${
          resultsText || "No votes were cast."
        }`,
        response_type: "ephemeral",
      },
    };
  } catch (error) {
    console.error("Error ending vote:", error);
    return {
      status: 200,
      body: {
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        response_type: "ephemeral",
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

    // Create the modal view
    const view = {
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
            type: "multi_users_select",
            action_id: "vote_allowed_voters_input",
            placeholder: {
              type: "plain_text",
              text: "Select users allowed to vote",
              emoji: true,
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
        {
          type: "input",
          block_id: "vote_duration",
          optional: true,
          element: {
            type: "plain_text_input",
            action_id: "vote_duration_input",
            placeholder: {
              type: "plain_text",
              text: "24h",
            },
            initial_value: "24h",
          },
          label: {
            type: "plain_text",
            text: "Duration (e.g., 24h, 7d)",
            emoji: true,
          },
          hint: {
            type: "plain_text",
            text: "Use h for hours, d for days",
            emoji: true,
          },
        },
      ],
      private_metadata: JSON.stringify({
        channelId,
        userId,
      }),
    };

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
      console.error("Error opening vote creation modal:", result.error);
      return {
        status: 200,
        body: {
          text: `Error opening vote creation modal: ${result.error}`,
          response_type: "ephemeral",
        },
      };
    }

    // Successfully opened modal
    return {
      status: 200,
      body: {},
    };
  } catch (error) {
    console.error("Error opening vote creation modal:", error);
    return {
      status: 200,
      body: {
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        response_type: "ephemeral",
      },
    };
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
