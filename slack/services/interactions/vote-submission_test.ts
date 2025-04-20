import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { afterAll, beforeAll, describe, it } from "jsr:@std/testing/bdd";
import { handleVoteSubmission } from "./vote-submission.ts";
import type { SlackInteraction } from "./types.ts";
import { prisma, votesService, workspaceService } from "@db/prisma.ts";
import { spy } from "jsr:@std/testing/mock";

describe(
  "handleVoteSubmission",
  { sanitizeResources: false, sanitizeOps: false },
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
        workspaceId: workspaceId,
        channelId: mockChannelId,
        creatorId: mockUserId,
        title: "Test Vote for Submission",
        description: "Test vote description for submission",
        options: ["Option A", "Option B", "Option C"],
        creditsPerUser: 100,
      });

      // Store the created vote ID for later use
      createdVoteId = vote.id;
    });

    afterAll(async () => {
      // Clean up test data
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

    // Helper to create mock submission payloads for testing
    const createMockSubmission = (options: {
      voteId?: string;
      userId?: string;
      stateValues?: Record<string, Record<string, { value: string }>>;
    }): SlackInteraction => {
      const {
        voteId,
        userId = mockUserId,
        stateValues = {
          option_0: { credits_0: { value: "4" } },
          option_1: { credits_1: { value: "9" } },
          option_2: { credits_2: { value: "0" } },
        },
      } = options;

      return {
        type: "view_submission",
        user: { id: userId },
        view: {
          private_metadata: voteId ? JSON.stringify({ voteId }) : "{}",
          state: {
            values: stateValues,
          },
        },
      } as SlackInteraction;
    };

    it("returns error when no vote ID in metadata", async () => {
      using getVoteByIdSpy = spy(votesService, "getVoteById");

      const payload = createMockSubmission({ voteId: undefined });
      const response = await handleVoteSubmission(payload);

      assertEquals(getVoteByIdSpy.calls.length, 0);
      assertEquals(response.status, 200);
      assertEquals(response.body.response_type, "ephemeral");
      assertStringIncludes(
        JSON.stringify(response.body.blocks || []),
        "No vote ID found",
      );
    });

    it("returns error when vote not found", async () => {
      const nonExistentVoteId = crypto.randomUUID();
      const payload = createMockSubmission({ voteId: nonExistentVoteId });

      const response = await handleVoteSubmission(payload);

      assertEquals(response.status, 200);
      assertStringIncludes(response.body.text || "", "not found");
    });

    it("returns error when user is not allowed to vote", async () => {
      // Create a vote with allowed voters list that doesn't include our test user
      const restrictedVote = await votesService.createVote({
        workspaceId: workspaceId,
        channelId: mockChannelId,
        creatorId: "another-user",
        title: "Restricted Vote",
        description: "Only specific users can vote",
        options: ["Option 1", "Option 2"],
        allowedVoters: ["allowed-user-1", "allowed-user-2"],
        creditsPerUser: 100,
      });

      const payload = createMockSubmission({ voteId: restrictedVote.id });
      const response = await handleVoteSubmission(payload);

      assertEquals(response.status, 200);
      assertEquals(response.body.response_action, "errors");
      assertStringIncludes(
        JSON.stringify(response.body.errors),
        "not authorized to vote",
      );

      // Clean up the restricted vote
      await prisma.vote.delete({
        where: {
          id: restrictedVote.id,
        },
      });
    });

    it("returns error when vote has ended", async () => {
      // Create a vote that is already ended
      const endedVote = await votesService.createVote({
        workspaceId: workspaceId,
        channelId: mockChannelId,
        creatorId: mockUserId,
        title: "Ended Vote",
        description: "This vote has already ended",
        options: ["Option X", "Option Y"],
        creditsPerUser: 100,
      });

      // End the vote
      await votesService.endVote(endedVote.id);

      const payload = createMockSubmission({ voteId: endedVote.id });
      const response = await handleVoteSubmission(payload);

      assertEquals(response.status, 200);
      assertEquals(response.body.response_action, "errors");
      assertStringIncludes(
        JSON.stringify(response.body.errors),
        "This vote has ended",
      );

      // Clean up the ended vote
      await prisma.vote.delete({
        where: {
          id: endedVote.id,
        },
      });
    });

    it("returns error when credits are not perfect squares", async () => {
      const stateValues = {
        option_0: { credits_0: { value: "5" } }, // Not a perfect square
        option_1: { credits_1: { value: "9" } }, // Is a perfect square
      };

      const payload = createMockSubmission({ stateValues, voteId: createdVoteId });
      const response = await handleVoteSubmission(payload);

      assertEquals(response.status, 200);
      assertEquals(response.body.response_action, "errors");
      assertStringIncludes(
        JSON.stringify(response.body.errors),
        "perfect square numbers",
      );
    });

    it("shows error on the correct field for non-perfect square values", async () => {
      // 1. Test error on first field
      const stateValuesFirstField = {
        option_0: { credits_0: { value: "5" } }, // Not a perfect square - first field
        option_1: { credits_1: { value: "9" } }, // Is a perfect square
        option_2: { credits_2: { value: "4" } }, // Is a perfect square
      };

      const payload1 = createMockSubmission({
        stateValues: stateValuesFirstField,
        voteId: createdVoteId,
      });
      const response1 = await handleVoteSubmission(payload1);

      assertEquals(response1.status, 200);
      assertEquals(response1.body.response_action, "errors");
      // Error should be on option_0
      assertEquals(
        "option_0" in (response1.body.errors as Record<string, string>),
        true,
        "Error should be shown on the first field",
      );
      assertStringIncludes(
        (response1.body.errors as Record<string, string>).option_0,
        "perfect square numbers",
      );

      // 2. Test error on middle field
      const stateValuesMiddleField = {
        option_0: { credits_0: { value: "9" } }, // Is a perfect square
        option_1: { credits_1: { value: "10" } }, // Not a perfect square - middle field
        option_2: { credits_2: { value: "4" } }, // Is a perfect square
      };

      const payload2 = createMockSubmission({
        stateValues: stateValuesMiddleField,
        voteId: createdVoteId,
      });
      const response2 = await handleVoteSubmission(payload2);

      assertEquals(response2.status, 200);
      assertEquals(response2.body.response_action, "errors");
      // Error should be on option_1
      assertEquals(
        "option_1" in (response2.body.errors as Record<string, string>),
        true,
        "Error should be shown on the middle field",
      );
      assertStringIncludes(
        (response2.body.errors as Record<string, string>).option_1,
        "perfect square numbers",
      );

      // 3. Test error on last field
      const stateValuesLastField = {
        option_0: { credits_0: { value: "4" } }, // Is a perfect square
        option_1: { credits_1: { value: "9" } }, // Is a perfect square
        option_2: { credits_2: { value: "7" } }, // Not a perfect square - last field
      };

      const payload3 = createMockSubmission({
        stateValues: stateValuesLastField,
        voteId: createdVoteId,
      });
      const response3 = await handleVoteSubmission(payload3);

      assertEquals(response3.status, 200);
      assertEquals(response3.body.response_action, "errors");
      // Error should be on option_2
      assertEquals(
        "option_2" in (response3.body.errors as Record<string, string>),
        true,
        "Error should be shown on the last field",
      );
      assertStringIncludes(
        (response3.body.errors as Record<string, string>).option_2,
        "perfect square numbers",
      );
    });

    it("returns error when total credits exceed allowed limit", async () => {
      // Create a vote with lower credit limit
      const limitedVote = await votesService.createVote({
        workspaceId: workspaceId,
        channelId: mockChannelId,
        creatorId: mockUserId,
        title: "Limited Credits Vote",
        description: "Vote with limited credits",
        options: ["Option 1", "Option 2"],
        creditsPerUser: 9, // Only allow 9 credits (3 votes)
      });

      // Submit with too many credits
      const stateValues = {
        option_0: { credits_0: { value: "4" } },
        option_1: { credits_1: { value: "9" } }, // Total: 13 > 9
      };

      const payload = createMockSubmission({
        voteId: limitedVote.id,
        stateValues,
      });

      const response = await handleVoteSubmission(payload);

      assertEquals(response.status, 200);
      assertEquals(response.body.response_action, "errors");
      assertStringIncludes(
        JSON.stringify(response.body.errors),
        "exceeds the limit",
      );

      // Clean up the limited vote
      await prisma.vote.delete({
        where: {
          id: limitedVote.id,
        },
      });
    });

    it("successfully records valid votes", async () => {
      // Create valid vote submission
      const stateValues = {
        option_0: { credits_0: { value: "4" } }, // 2 votes
        option_1: { credits_1: { value: "9" } }, // 3 votes
        option_2: { credits_2: { value: "0" } }, // 0 votes
      };

      const payload = createMockSubmission({ stateValues, voteId: createdVoteId });

      // Mock fetch for checkAndAutoEndVote function
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (
        _url: string | URL | Request,
        _init?: RequestInit,
      ) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true }),
        } as Response);
      };

      try {
        const response = await handleVoteSubmission(payload);

        assertEquals(response.status, 200);
        assertEquals(response.body.response_action, "clear");

        // Verify the vote responses were recorded in the database
        const vote = await votesService.getVoteById(createdVoteId);

        // Find responses for this user
        const userResponses = vote?.responses.filter((r) => r.userId === mockUserId) || [];

        assertEquals(userResponses.length, 3);

        // Check each option has the correct credits
        const option0Response = userResponses.find((r) => r.optionIndex === 0);
        const option1Response = userResponses.find((r) => r.optionIndex === 1);
        const option2Response = userResponses.find((r) => r.optionIndex === 2);

        assertEquals(option0Response?.credits, 4);
        assertEquals(option1Response?.credits, 9);
        assertEquals(option2Response?.credits, 0);
      } finally {
        // Restore original fetch
        globalThis.fetch = originalFetch;
      }
    });

    it("handles errors gracefully", async () => {
      // Create a mock payload that will cause an error
      const payload = createMockSubmission({ voteId: createdVoteId });

      // Make votesService.getVoteById throw an error
      const originalGetVoteById = votesService.getVoteById;
      votesService.getVoteById = () => {
        throw new Error("Simulated database error");
      };

      try {
        const response = await handleVoteSubmission(payload);

        assertEquals(response.status, 200);
        assertEquals(response.body.response_action, "errors");
        assertStringIncludes(
          JSON.stringify(response.body.errors),
          "Error processing your vote",
        );
      } finally {
        // Restore original method
        votesService.getVoteById = originalGetVoteById;
      }
    });
  },
);
