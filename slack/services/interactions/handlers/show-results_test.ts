import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { afterAll, afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { handleShowVoteResults } from "./show-results.ts";
import type { SlackInteraction } from "../types.ts";
import { prisma } from "@db/prisma.ts";

describe(
  "handleShowVoteResults",
  { sanitizeResources: false, sanitizeOps: false },
  () => {
    // Test data
    const testWorkspaceId = "aaaaaaaa-bbbb-cccc-dddd-000000000001";
    const testVoteId = "aaaaaaaa-bbbb-cccc-dddd-000000000002";
    const testChannelId = "C12345678";
    const testUserId = "U12345678";

    // Basic setup for the mock Slack action
    const mockAction = {
      action_id: "show_results",
      block_id: "actions_block",
      value: `results_${testVoteId}`,
      type: "button",
    };

    const mockPayload: SlackInteraction = {
      type: "block_actions",
      actions: [mockAction],
      user: { id: testUserId },
      response_url: "https://hooks.slack.com/actions/response_url",
      trigger_id: "trigger123",
      team: { id: "T12345678" },
      channel: { id: testChannelId },
    };

    // Set up and clean up test data
    beforeEach(async () => {
      // Clean up any existing test data
      await prisma.voteResponse.deleteMany({
        where: {
          vote: { workspaceId: testWorkspaceId },
        },
      });

      await prisma.vote.deleteMany({
        where: { workspaceId: testWorkspaceId },
      });

      await prisma.workspace.deleteMany({
        where: { id: testWorkspaceId },
      });

      // Create test workspace
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

      // Create a test vote
      await prisma.vote.create({
        data: {
          id: testVoteId,
          workspaceId: testWorkspaceId,
          channelId: testChannelId,
          creatorId: testUserId,
          title: "Test Vote",
          description: "A test vote for show-results handler",
          options: ["Option 1", "Option 2"],
          allowedVoters: [testUserId],
          creditsPerUser: 100,
          isEnded: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Add some vote responses
      await prisma.voteResponse.create({
        data: {
          voteId: testVoteId,
          userId: testUserId,
          optionIndex: 0,
          credits: 75,
        },
      });

      await prisma.voteResponse.create({
        data: {
          voteId: testVoteId,
          userId: testUserId,
          optionIndex: 1,
          credits: 25,
        },
      });
    });

    afterEach(async () => {
      // Clean up test data
      await prisma.voteResponse.deleteMany({
        where: {
          vote: { workspaceId: testWorkspaceId },
        },
      });

      await prisma.vote.deleteMany({
        where: { workspaceId: testWorkspaceId },
      });

      await prisma.workspace.deleteMany({
        where: { id: testWorkspaceId },
      });
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("returns error when no vote ID is provided", async () => {
      const actionWithoutValue = {
        ...mockAction,
        value: undefined,
      };

      const response = await handleShowVoteResults(
        actionWithoutValue,
        mockPayload,
        testWorkspaceId,
      );

      assertEquals(response.status, 200);
      assertStringIncludes(response.body.text || "", "No vote ID was provided");
    });

    it("returns status 200 with empty body for valid vote", async () => {
      // Since we can't mock the fetch calls without extra libraries,
      // we'll just test that it returns the expected success response
      const response = await handleShowVoteResults(
        mockAction,
        mockPayload,
        testWorkspaceId,
      );

      assertEquals(response.status, 200);
      assertEquals(response.body, {});
    });

    it("returns error for non-existent vote", async () => {
      // Create a valid UUID that doesn't exist in the database
      const nonExistentId = crypto.randomUUID();
      const nonExistentAction = {
        ...mockAction,
        value: `results_${nonExistentId}`,
      };

      const response = await handleShowVoteResults(
        nonExistentAction,
        mockPayload,
        testWorkspaceId,
      );

      assertEquals(response.status, 200);
      // Just verify we got an error response with some text
      assertEquals(typeof response.body.text, "string");
    });
  },
);
