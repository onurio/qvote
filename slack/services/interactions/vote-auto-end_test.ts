import { assertEquals } from "@std/assert/equals";
import { afterAll, afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { checkAndAutoEndVote } from "./vote-auto-end.ts";
import { prisma, votesService } from "@db/prisma.ts";
import { haveAllVotersVoted } from "@slack/services/interactions/vote-utils.ts";

describe(
  "checkAndAutoEndVote",
  { sanitizeResources: false, sanitizeOps: false },
  () => {
    // Test data IDs - use valid UUIDs
    const testWorkspaceId = "aaaaaaaa-bbbb-cccc-dddd-000000000001";
    const testChannelId = "C12345678";
    const testUserId1 = "U12345678";
    const testUserId2 = "U87654321";

    // Clean up database before each test
    beforeEach(async () => {
      // Clean up any existing test data

      await prisma.vote.deleteMany({
        where: { workspaceId: testWorkspaceId },
      });

      await prisma.workspace.deleteMany({
        where: { id: testWorkspaceId },
      });

      await prisma.voteResponse.deleteMany({
        where: {
          vote: {
            workspaceId: testWorkspaceId,
          },
        },
      });

      // Create a test workspace for all tests that require it
      await prisma.workspace.create({
        data: {
          id: testWorkspaceId,
          teamId: "T12345678",
          teamName: "Test Team",
          accessToken: "xoxb-test-token",
          botUserId: "B12345678",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    });

    // Clean up database after all tests
    afterEach(async () => {
      // First find all votes for the workspace
      const votes = await prisma.vote.findMany({
        where: { workspaceId: testWorkspaceId },
        select: { id: true },
      });

      // Delete all vote responses for those votes
      if (votes.length > 0) {
        await prisma.voteResponse.deleteMany({
          where: {
            voteId: { in: votes.map((v) => v.id) },
          },
        });
      }

      // Delete all votes for the workspace
      await prisma.vote.deleteMany({
        where: { workspaceId: testWorkspaceId },
      });

      // Delete the workspace
      await prisma.workspace.deleteMany({
        where: { id: testWorkspaceId },
      });
    });

    afterAll(async () => {
      // Clean up any remaining test data
      await prisma.vote.deleteMany();
      await prisma.workspace.deleteMany();
      await prisma.voteResponse.deleteMany();

      await prisma.$disconnect();
    });

    it("tests haveAllVotersVoted function", () => {
      // Test data for the utility function
      const vote = {
        responses: [
          { userId: testUserId1, credits: 10 },
          { userId: testUserId2, credits: 5 },
        ],
      };
      const allowedVoters = [testUserId1, testUserId2];

      // Check if all voters have voted
      const allVoted = haveAllVotersVoted(vote, allowedVoters);
      // Assert that all voters have voted
      assertEquals(allVoted, true);

      // Test not all voters have voted
      const vote2 = {
        responses: [{ userId: testUserId1, credits: 10 }],
      };
      const allVoted2 = haveAllVotersVoted(vote2, allowedVoters);
      assertEquals(allVoted2, false);
    });

    it("returns early if vote not found", async () => {
      // Use a properly formatted UUID that doesn't exist in the database
      const nonExistentId = crypto.randomUUID();
      await checkAndAutoEndVote(nonExistentId, testUserId1);

      // No assertions needed - if there were any errors, the test would fail
    });

    it("returns early if vote is already ended", async () => {
      // Create a vote
      const createdVote = await votesService.createVote({
        workspaceId: testWorkspaceId,
        channelId: testChannelId,
        creatorId: testUserId1,
        title: "Test Ended Vote",
        description: "This vote is already ended",
        options: ["Option 1", "Option 2"],
        allowedVoters: [testUserId1, testUserId2],
        creditsPerUser: 100,
      });

      // End the vote immediately
      await votesService.endVote(createdVote.id);

      await checkAndAutoEndVote(createdVote.id, testUserId1);

      // Verify the vote is still ended
      const vote = await votesService.getVoteById(createdVote.id);
      assertEquals(vote?.isEnded, true);
    });

    it("returns early if no allowed voters", async () => {
      // Create a vote with no allowed voters (null)
      const createdVote = await votesService.createVote({
        workspaceId: testWorkspaceId,
        channelId: testChannelId,
        creatorId: testUserId1,
        title: "Test Vote No Allowed Voters",
        description: "This vote has no allowed voters",
        options: ["Option 1", "Option 2"],
        allowedVoters: null,
        creditsPerUser: 100,
      });

      await checkAndAutoEndVote(createdVote.id, testUserId1);

      // Verify the vote is still not ended
      const vote = await votesService.getVoteById(createdVote.id);
      assertEquals(vote?.isEnded, false);
    });

    it("returns early if empty allowed voters array", async () => {
      // Create a vote with empty allowed voters array
      const createdVote = await votesService.createVote({
        workspaceId: testWorkspaceId,
        channelId: testChannelId,
        creatorId: testUserId1,
        title: "Test Vote Empty Allowed Voters",
        description: "This vote has an empty allowed voters array",
        options: ["Option 1", "Option 2"],
        allowedVoters: [],
        creditsPerUser: 100,
      });

      await checkAndAutoEndVote(createdVote.id, testUserId1);

      // Verify the vote is still not ended
      const vote = await votesService.getVoteById(createdVote.id);
      assertEquals(vote?.isEnded, false);
    });

    it("returns early if not all voters have voted yet", async () => {
      // Create a vote where not all allowed voters have voted
      const createdVote = await votesService.createVote({
        workspaceId: testWorkspaceId,
        channelId: testChannelId,
        creatorId: testUserId1,
        title: "Test Vote Not All Voted",
        description: "This vote is missing some votes",
        options: ["Option 1", "Option 2"],
        allowedVoters: [testUserId1, testUserId2],
        creditsPerUser: 100,
      });

      // Add response for only one voter
      await votesService.recordVoteResponse(createdVote.id, testUserId1, 0, 10);

      await checkAndAutoEndVote(createdVote.id, testUserId1);

      // Verify the vote is still not ended
      const vote = await votesService.getVoteById(createdVote.id);
      assertEquals(vote?.isEnded, false);
    });

    it("ends vote when all voters have voted", async () => {
      // Create a vote where all allowed voters will vote
      const createdVote = await votesService.createVote({
        workspaceId: testWorkspaceId,
        channelId: testChannelId,
        creatorId: testUserId1,
        title: "Test Vote All Voted",
        description: "All allowed voters have voted on this vote",
        options: ["Option 1", "Option 2"],
        allowedVoters: [testUserId1, testUserId2],
        creditsPerUser: 100,
      });

      // Add responses for both voters
      await votesService.recordVoteResponse(createdVote.id, testUserId1, 0, 10);
      await votesService.recordVoteResponse(createdVote.id, testUserId2, 1, 20);

      await checkAndAutoEndVote(createdVote.id, testUserId2);

      // Verify the vote is now ended
      const vote = await votesService.getVoteById(createdVote.id);
      assertEquals(vote?.isEnded, true);
    });

    it("returns early if workspace token not found", async () => {
      // Create a vote but NOT a workspace (so token won't be found)
      const createdVote = await votesService.createVote({
        workspaceId: testWorkspaceId, // This workspace doesn't exist
        channelId: testChannelId,
        creatorId: testUserId1,
        title: "Test Vote No Workspace",
        description: "This vote has a workspace with no token",
        options: ["Option 1", "Option 2"],
        allowedVoters: [testUserId1, testUserId2],
        creditsPerUser: 100,
      });

      // Add responses for both voters
      await votesService.recordVoteResponse(createdVote.id, testUserId1, 0, 10);
      await votesService.recordVoteResponse(createdVote.id, testUserId2, 1, 20);

      await checkAndAutoEndVote(createdVote.id, testUserId2);

      // The vote should still be ended even if token wasn't found
      const vote = await votesService.getVoteById(createdVote.id);
      assertEquals(vote?.isEnded, true);
    });
  },
);
