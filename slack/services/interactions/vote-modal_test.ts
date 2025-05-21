import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { afterAll, beforeAll, describe, it } from "jsr:@std/testing/bdd";
import { handleOpenVoteModal } from "./vote-modal.ts";
import type { SlackInteraction } from "./types.ts";
import { prisma, votesService, workspaceService } from "@db/prisma.ts";

describe(
  "handleOpenVoteModal",
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    // Setup test data
    const mockTeamId = "test-team-id";
    const mockChannelId = "channel-123";
    const mockUserId = "user-456";
    let workspaceId: string;
    let createdVoteId: string;

    // Set up test data before running tests
    beforeAll(async () => {
      // Create a test workspace
      const workspace = await workspaceService.saveWorkspace(
        mockTeamId,
        "Test Team",
        "xoxb-test-token",
        "bot-user-id",
      );

      // Store the created workspace ID
      workspaceId = workspace.id;

      // Create a test vote
      const vote = await votesService.createVote({
        workspaceId: workspaceId, // Use the actual UUID from the database
        channelId: mockChannelId,
        creatorId: mockUserId,
        title: "Test Vote",
        description: "Test vote description",
        options: ["Option 1", "Option 2", "Option 3"],
        creditsPerUser: 100,
      });

      // Store the created vote ID for later use
      createdVoteId = vote.id;
    });

    afterAll(async () => {
      // Clean up test data
      // This helps ensure tests can be run multiple times without conflicts
      try {
        // Delete test votes first (to avoid foreign key constraints)
        await prisma.voteResponse.deleteMany({
          where: {
            voteId: {
              in: [createdVoteId],
            },
          },
        });

        await prisma.vote.deleteMany({
          where: {
            workspaceId: workspaceId,
          },
        });

        // Delete test workspace
        await prisma.workspace.delete({
          where: {
            teamId: mockTeamId,
          },
        });
      } catch (error) {
        console.error("Error cleaning up test data:", error);
      }
    });

    // Basic setup for the mock Slack action
    const createMockAction = (value: string | undefined) => ({
      action_id: "open_vote_modal",
      block_id: "actions_block",
      value,
      type: "button",
    });

    const createMockPayload = (userId: string): SlackInteraction => ({
      type: "block_actions",
      actions: [createMockAction(`vote_${createdVoteId}`)],
      user: { id: userId },
      trigger_id: "trigger123",
      team: { id: mockTeamId },
      channel: { id: mockChannelId },
    });

    it("returns error when no vote ID is provided", async () => {
      const actionWithoutValue = createMockAction(undefined);
      const mockPayload = createMockPayload(mockUserId);

      const response = await handleOpenVoteModal(
        actionWithoutValue,
        mockPayload,
        workspaceId,
      );

      assertEquals(response.status, 200);
      assertStringIncludes(response.body.text || "", "No vote ID was provided");
    });

    it("returns error when vote not found", async () => {
      // Generate a valid UUID that doesn't exist in the database
      const nonExistentVoteId = crypto.randomUUID();

      const actionWithNonExistentVote = createMockAction(
        `vote_${nonExistentVoteId}`,
      );
      const mockPayload = createMockPayload(mockUserId);

      const response = await handleOpenVoteModal(
        actionWithNonExistentVote,
        mockPayload,
        workspaceId,
      );

      assertEquals(response.status, 200);
      assertStringIncludes(response.body.text || "", "not found");
    });

    it("returns error when workspace token not found", async () => {
      const action = createMockAction(`vote_${createdVoteId}`);
      const mockPayload = createMockPayload(mockUserId);

      // Generate a random UUID for a non-existent workspace
      const nonExistentWorkspaceId = crypto.randomUUID();

      const response = await handleOpenVoteModal(
        action,
        mockPayload,
        nonExistentWorkspaceId,
      );

      assertEquals(response.status, 200);
      assertStringIncludes(
        response.body.text || "",
        "Error opening vote modal",
      );
    });

    it("returns error when vote has ended", async () => {
      // First end the vote
      await votesService.endVote(createdVoteId);

      const action = createMockAction(`vote_${createdVoteId}`);
      const mockPayload = createMockPayload(mockUserId);

      const response = await handleOpenVoteModal(
        action,
        mockPayload,
        workspaceId,
      );

      assertEquals(response.status, 200);
      assertStringIncludes(response.body.text || "", "This vote has ended");
    });

    it("returns error when user is not authorized to vote", async () => {
      // Create a new vote with restricted voters
      const unauthorizedUserId = "unauthorized-user-789";
      const authorizedUserId = "authorized-user-123";

      const vote = await votesService.createVote({
        workspaceId: workspaceId,
        channelId: mockChannelId,
        creatorId: mockUserId,
        title: "Restricted Vote",
        description: "Only authorized users can vote",
        options: ["Option 1", "Option 2"],
        allowedVoters: [authorizedUserId, mockUserId], // This user is not included
        creditsPerUser: 100,
      });

      const action = createMockAction(`vote_${vote.id}`);
      // Add response_url to the payload
      const mockPayloadWithResponseUrl = {
        ...createMockPayload(unauthorizedUserId),
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
          if (url === mockPayloadWithResponseUrl.response_url) {
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

        const response = await handleOpenVoteModal(
          action,
          mockPayloadWithResponseUrl,
          workspaceId,
        );

        assertEquals(response.status, 200);
        assertStringIncludes(
          response.body.text || "",
          "not authorized to vote",
        );
        assertEquals(
          responseUrlCalled,
          true,
          "Should call response_url with error message",
        );
      } finally {
        // Restore original fetch
        globalThis.fetch = originalFetch;

        // Clean up the test vote
        try {
          await prisma.vote.delete({
            where: {
              id: vote.id,
            },
          });
        } catch (error) {
          console.error("Error cleaning up restricted test vote:", error);
        }
      }
    });

    it("builds modal with user's previous votes", async () => {
      // Create a new vote since the previous one was ended
      const vote = await votesService.createVote({
        workspaceId: workspaceId,
        channelId: mockChannelId,
        creatorId: mockUserId,
        title: "New Test Vote",
        description: "Test vote with responses",
        options: ["Option A", "Option B", "Option C"],
        creditsPerUser: 100,
      });

      // Record some responses for the user
      await votesService.recordVoteResponse(vote.id, mockUserId, 0, 4); // 2 votes for option 0
      await votesService.recordVoteResponse(vote.id, mockUserId, 1, 9); // 3 votes for option 1

      // Mock fetch to avoid actual API calls
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (
        _url: string | URL | Request,
        _init?: RequestInit,
      ) => {
        // Return a successful response for our test
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true }),
        } as Response);
      };

      const action = createMockAction(`vote_${vote.id}`);

      // Create a specific payload for this test with the correct vote ID
      const specificPayload = {
        type: "block_actions",
        actions: [action],
        user: { id: mockUserId },
        trigger_id: "trigger123",
        team: { id: mockTeamId },
        channel: { id: mockChannelId },
      } as SlackInteraction;

      try {
        const response = await handleOpenVoteModal(
          action,
          specificPayload,
          workspaceId,
        );

        assertEquals(response.status, 200);
        assertEquals(response.body, {});
      } finally {
        // Restore original fetch
        globalThis.fetch = originalFetch;

        // Clean up the additional vote we created
        try {
          await prisma.voteResponse.deleteMany({
            where: {
              voteId: vote.id,
            },
          });

          await prisma.vote.delete({
            where: {
              id: vote.id,
            },
          });
        } catch (error) {
          console.error("Error cleaning up test vote:", error);
        }
      }
    });
  },
);
