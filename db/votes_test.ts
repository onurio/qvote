import { assertEquals, assertRejects } from "@std/assert";
import { VotesService } from "./votes.ts";
// @ts-types="generated/index.d.ts"
import { PrismaClient } from "generated/index.js";
import { NotFoundError } from "@db/errors.ts";
import { afterAll, beforeAll, describe, it } from "jsr:@std/testing/bdd";

describe(
  "VotesService",
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    const db = new PrismaClient();
    const votesService = new VotesService(db);

    const testWorkspaceId = "aaaaaaaa-bbbb-cccc-dddd-000000000001";
    const testChannelId = "C12345678";
    const testUserId1 = "U12345678";
    const testUserId2 = "U87654321";

    beforeAll(async () => {
      // Delete any existing workspace with this ID
      await db.workspace.deleteMany({
        where: { id: testWorkspaceId },
      });

      // Create the test workspace
      await db.workspace.create({
        data: {
          id: testWorkspaceId,
          teamId: "T12345679",
          teamName: "Test Team",
          accessToken: "xoxb-test-token",
          botUserId: "B12345678",
        },
      });
    });

    afterAll(async () => {
      // Clean up all test data
      await db.voteResponse.deleteMany();
      await db.vote.deleteMany();
      await db.workspace.deleteMany();
      await db.$disconnect();
    });

    it("createVote creates a new vote", async () => {
      const result = await votesService.createVote({
        workspaceId: testWorkspaceId,
        channelId: testChannelId,
        creatorId: testUserId1,
        title: "Test Vote",
        description: "This is a test vote",
        options: ["Option 1", "Option 2", "Option 3"],
      });

      assertEquals(result.title, "Test Vote");
      assertEquals(result.description, "This is a test vote");
      assertEquals(result.options, ["Option 1", "Option 2", "Option 3"]);
      assertEquals(result.creditsPerUser, 100);
      assertEquals(result.isEnded, false);
    });

    it("getVoteById returns a vote and throws when not found", async () => {
      const vote = await votesService.createVote({
        workspaceId: testWorkspaceId,
        channelId: testChannelId,
        creatorId: testUserId1,
        title: "Test Vote",
        description: "This is a test vote",
        options: ["Option 1", "Option 2", "Option 3"],
      });

      const result = await votesService.getVoteById(vote.id);

      assertEquals(result.id, vote.id);
      assertEquals(result.title, "Test Vote");
      assertEquals((result.options as string[]).length, 3);

      await assertRejects(
        async () => await votesService.getVoteById("nonexistent-id"),
        NotFoundError,
        "Vote with ID nonexistent-id not found",
      );
    });

    it("endVote sets isEnded to true", async () => {
      const vote = await votesService.createVote({
        workspaceId: testWorkspaceId,
        channelId: testChannelId,
        creatorId: testUserId1,
        title: "Vote to End",
        description: "This is a test vote that we'll end",
        options: ["Option 1", "Option 2"],
      });

      const result = await votesService.endVote(vote.id);

      assertEquals(result.isEnded, true);
      assertEquals(result.id, vote.id);

      const updatedVote = await votesService.getVoteById(vote.id);
      assertEquals(updatedVote.isEnded, true);
    });

    it("getVoteResults calculates quadratic voting results correctly", async () => {
      const vote = await votesService.createVote({
        workspaceId: testWorkspaceId,
        channelId: testChannelId,
        creatorId: testUserId1,
        title: "Voting Results Test",
        description: "Testing vote results calculation",
        options: ["Option A", "Option B", "Option C"],
      });

      await votesService.recordVoteResponse(vote.id, testUserId1, 0, 16);
      await votesService.recordVoteResponse(vote.id, testUserId2, 1, 25);
      await votesService.recordVoteResponse(vote.id, "U99999999", 0, 9);

      const result = await votesService.getVoteResults(vote.id);

      assertEquals(result.vote.id, vote.id);
      assertEquals(result.vote.title, "Voting Results Test");
      assertEquals(result.results.length, 3);

      const optionA = result.results.find((r) => r.option === "Option A");
      const optionB = result.results.find((r) => r.option === "Option B");
      const optionC = result.results.find((r) => r.option === "Option C");

      assertEquals(optionA?.totalCredits, 25);
      assertEquals(optionB?.totalCredits, 25);
      assertEquals(optionC?.totalCredits, 0);

      assertEquals(result.results[2].totalCredits, 0);
    });

    it("recordVoteResponse stores user votes correctly", async () => {
      const vote = await votesService.createVote({
        workspaceId: testWorkspaceId,
        channelId: testChannelId,
        creatorId: testUserId1,
        title: "Vote Response Test",
        description: "Testing vote responses",
        options: ["Option X", "Option Y"],
      });

      const result = await votesService.recordVoteResponse(
        vote.id,
        "test-user-id",
        1,
        36,
      );

      assertEquals(result.voteId, vote.id);
      assertEquals(result.userId, "test-user-id");
      assertEquals(result.optionIndex, 1);
      assertEquals(result.credits, 36);

      const voteWithResponses = await votesService.getVoteById(vote.id);
      const response = voteWithResponses.responses.find(
        (r) => r.userId === "test-user-id" && r.optionIndex === 1,
      );

      assertEquals(response?.credits, 36);
    });
  },
);
