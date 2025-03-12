import { assertEquals, assertStringIncludes } from "@std/assert";
import { createVoteBlocks } from "./blocks.ts";

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
  assertEquals((blocks[0].text as any).text, ":ballot_box: Test Vote");
  
  // Verify description is included
  assertEquals(blocks[1].type, "section");
  assertEquals((blocks[1].text as any).text, "This is a test vote");
  
  // Verify options are listed
  assertEquals(blocks[2].type, "section");
  assertStringIncludes((blocks[2].text as any).text, "*Options:*");
  assertStringIncludes((blocks[2].text as any).text, "*1.* Option 1");
  assertStringIncludes((blocks[2].text as any).text, "*2.* Option 2");
  assertStringIncludes((blocks[2].text as any).text, "*3.* Option 3");
  
  // Verify status shows end time
  assertEquals(blocks[3].type, "section");
  assertStringIncludes((blocks[3].text as any).text, "*Status:* :hourglass: Voting ends:");
  
  // Verify action buttons - for active vote should have Vote, Results, End Vote
  assertEquals(blocks[4].type, "actions");
  const elements = (blocks[4] as any).elements;
  assertEquals(elements.length, 3);
  
  // Vote button
  assertEquals(elements[0].action_id, "open_vote_modal");
  assertEquals(elements[0].text.text, "Vote");
  
  // Results button
  assertEquals(elements[1].action_id, "show_vote_results");
  assertEquals(elements[1].text.text, "Results");
  
  // End Vote button
  assertEquals(elements[2].action_id, "end_vote");
  assertEquals(elements[2].text.text, "End Vote");
  
  // Verify creator info in footer
  assertEquals(blocks[5].type, "context");
  assertStringIncludes((blocks[5].elements as any)[0].text, "Created by <@creator-123>");
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
  assertStringIncludes((blocks[3].text as any).text, "*Status:* :checkered_flag: Voting has ended");
  
  // Verify action buttons - for ended vote should only have Results button
  assertEquals(blocks[4].type, "actions");
  const elements = (blocks[4] as any).elements;
  assertEquals(elements.length, 1);
  
  // Only Results button should be present
  assertEquals(elements[0].action_id, "show_vote_results");
  assertEquals(elements[0].text.text, "Results");
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
  assertStringIncludes((blocks[3].text as any).text, "*Note:* This vote is restricted to specific users");
});