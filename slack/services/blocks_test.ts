import { assertEquals, assertStringIncludes } from "@std/assert";
import { createVoteBlocks, SlackBlock } from "./blocks.ts";

// Define more specific types for testing
interface HeaderBlock extends SlackBlock {
  type: "header";
  text: {
    type: string;
    text: string;
    emoji?: boolean;
  };
}

interface SectionBlock extends SlackBlock {
  type: "section";
  text: {
    type: string;
    text: string;
    emoji?: boolean;
  };
}

// Define type for blocks with elements
interface ElementsBlock extends SlackBlock {
  type: string;
  elements: Array<{
    type: string;
    action_id?: string;
    text?: {
      type: string;
      text: string;
    };
    value?: string;
    [key: string]: unknown;
  }>;
}

Deno.test("createVoteBlocks creates proper UI for active vote", () => {
  // Create mock vote data for an active vote
  const vote = {
    id: "vote-123",
    workspaceId: "workspace-123",
    channelId: "channel-123",
    creatorId: "creator-123",
    title: "Test Vote",
    description: "This is a test vote",
    options: ["Option 1", "Option 2", "Option 3"],
    allowedVoters: null,
    creditsPerUser: 100,
    startTime: new Date(),
    endTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
    isEnded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Generate blocks for the active vote
  const blocks = createVoteBlocks(vote, "bot-123");

  // Verify header and description
  assertEquals(blocks[0].type, "header");
  assertEquals((blocks[0] as HeaderBlock).text.text, ":ballot_box: Test Vote");

  // Verify description is included
  assertEquals(blocks[1].type, "section");
  assertEquals((blocks[1] as SectionBlock).text.text, "This is a test vote");

  // Verify options are listed
  assertEquals(blocks[2].type, "section");
  assertStringIncludes((blocks[2] as SectionBlock).text.text, "*Options:*");
  assertStringIncludes((blocks[2] as SectionBlock).text.text, "*1.* Option 1");
  assertStringIncludes((blocks[2] as SectionBlock).text.text, "*2.* Option 2");
  assertStringIncludes((blocks[2] as SectionBlock).text.text, "*3.* Option 3");

  // Verify status shows active vote
  assertEquals(blocks[3].type, "section");
  assertStringIncludes(
    (blocks[3] as SectionBlock).text.text,
    "*Status:* :hourglass: Vote in progress",
  );

  // Verify action buttons - for active vote should have Vote and End Vote only (no Results)
  assertEquals(blocks[4].type, "actions");
  const elements = (blocks[4] as ElementsBlock).elements;
  assertEquals(elements.length, 2);

  // Vote button
  assertEquals(elements[0].action_id, "open_vote_modal");
  assertEquals(elements[0].text?.text, "Vote");

  // End Vote button (no Results button for active votes)
  assertEquals(elements[1].action_id, "end_vote");
  assertEquals(elements[1].text?.text, "End Vote");

  // Verify creator info in footer
  assertEquals(blocks[5].type, "context");
  const element = (blocks[5] as ElementsBlock).elements[0];
  assertEquals(element.type, "mrkdwn");

  // Check if the element has a text property
  if ("text" in element) {
    assertStringIncludes(
      String(element.text),
      "Created by <@creator-123>",
    );
  }
});

Deno.test("createVoteBlocks creates proper UI for ended vote", () => {
  // Create mock vote data for an ended vote
  const vote = {
    id: "vote-123",
    workspaceId: "workspace-123",
    channelId: "channel-123",
    creatorId: "creator-123",
    title: "Test Vote",
    description: "This is a test vote",
    options: ["Option 1", "Option 2", "Option 3"],
    allowedVoters: null,
    creditsPerUser: 100,
    startTime: new Date(),
    endTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // In the past
    isEnded: true, // Vote is ended
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Generate blocks for the ended vote
  const blocks = createVoteBlocks(vote, "bot-123");

  // Verify status shows vote ended
  assertEquals(blocks[3].type, "section");
  assertStringIncludes(
    (blocks[3] as SectionBlock).text.text,
    "*Status:* :checkered_flag: Voting has ended",
  );

  // Verify action buttons - for ended vote should only have Results button
  assertEquals(blocks[4].type, "actions");
  const elements = (blocks[4] as ElementsBlock).elements;
  assertEquals(elements.length, 1);

  // Only Results button should be present
  assertEquals(elements[0].action_id, "show_vote_results");
  assertEquals(elements[0].text?.text, "Results");
});

Deno.test("createVoteBlocks handles restricted voters correctly", () => {
  // Create mock vote data with allowed voters restriction
  const vote = {
    id: "vote-123",
    workspaceId: "workspace-123",
    channelId: "channel-123",
    creatorId: "creator-123",
    title: "Test Vote",
    description: "This is a test vote",
    options: ["Option 1", "Option 2", "Option 3"],
    allowedVoters: ["user-1", "user-2"], // Only specific users can vote
    creditsPerUser: 100,
    startTime: new Date(),
    endTime: null,
    isEnded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Generate blocks
  const blocks = createVoteBlocks(vote, "bot-123");

  // Verify info text includes restriction note
  assertEquals(blocks[3].type, "section");
  assertStringIncludes(
    (blocks[3] as SectionBlock).text.text,
    "*Note:* This vote is restricted to specific users",
  );
});
