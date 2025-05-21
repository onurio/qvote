import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { afterAll, afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { handleEndVote } from "./end-vote.ts";
import type { SlackInteraction } from "../types.ts";
import { prisma, votesService } from "@db/prisma.ts";

describe(
  "handleEndVote",
  { sanitizeResources: false, sanitizeOps: false },
  () => {
    // Test data
    const testWorkspaceId = "aaaaaaaa-bbbb-cccc-dddd-000000000001";
    const testVoteId = "aaaaaaaa-bbbb-cccc-dddd-000000000002";
    const testChannelId = "C12345678";
    const testCreatorId = "U12345678";
    const testOtherUserId = "U87654321";

    // Basic setup for the mock Slack action
    const mockAction = {
      action_id: "end_vote",
      block_id: "actions_block",
      value: `end_${testVoteId}`,
      type: "button",
    };

    const mockPayload: SlackInteraction = {
      type: "block_actions",
      actions: [mockAction],
      user: { id: testCreatorId }, // Set as creator ID
      trigger_id: "trigger123",
      team: { id: "T12345678" },
      channel: { id: testChannelId },
      message: { ts: "1234567890.123456" },
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
          creatorId: testCreatorId,
          title: "Test Vote",
          description: "A test vote for end-vote handler",
          options: ["Option 1", "Option 2"],
          allowedVoters: [testCreatorId, testOtherUserId],
          creditsPerUser: 100,
          isEnded: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Add some vote responses
      await prisma.voteResponse.create({
        data: {
          voteId: testVoteId,
          userId: testCreatorId,
          optionIndex: 0,
          credits: 75,
        },
      });

      await prisma.voteResponse.create({
        data: {
          voteId: testVoteId,
          userId: testOtherUserId,
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

      const response = await handleEndVote(
        actionWithoutValue,
        mockPayload,
        testWorkspaceId,
      );

      assertEquals(response.status, 200);
      assertStringIncludes(response.body.text || "", "No vote ID was provided");
    });

    it("returns error when user is not the vote creator", async () => {
      // Create payload with a different user
      const nonCreatorPayload = {
        ...mockPayload,
        user: { id: testOtherUserId },
        response_url: "https://hooks.slack.com/actions/fake_response_url",
      };

      // Mock fetch for the response_url call
      const originalFetch = globalThis.fetch;
      let responseUrlCalled = false;

      try {
        globalThis.fetch = (
          url: string | URL | Request,
          init?: RequestInit,
        ) => {
          if (url === nonCreatorPayload.response_url) {
            responseUrlCalled = true;
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ ok: true }),
            } as Response);
          }

          // For other fetch calls, use original implementation
          // @ts-ignore // Ignore TypeScript error for fetch
          return originalFetch(url, init);
        };

        const response = await handleEndVote(
          mockAction,
          nonCreatorPayload,
          testWorkspaceId,
        );

        assertEquals(response.status, 200);
        assertStringIncludes(
          response.body.text || "",
          "Only the creator of this vote",
        );
        assertEquals(
          responseUrlCalled,
          true,
          "Should call response_url with error message",
        );
      } finally {
        // Restore original fetch
        globalThis.fetch = originalFetch;
      }
    });

    it("successfully ends vote when called by creator", async () => {
      const response = await handleEndVote(
        mockAction,
        mockPayload,
        testWorkspaceId,
      );

      assertEquals(response.status, 200);
      assertStringIncludes(response.body.text || "", "has been ended");

      // Verify vote was marked as ended in database
      const vote = await votesService.getVoteById(testVoteId);
      assertEquals(vote.isEnded, true);
    });

    it("returns error for non-existent vote", async () => {
      // Create a valid UUID that doesn't exist in the database
      const nonExistentId = crypto.randomUUID();
      const nonExistentAction = {
        ...mockAction,
        value: `end_${nonExistentId}`,
      };

      const response = await handleEndVote(
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
