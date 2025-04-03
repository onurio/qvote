import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { afterAll, beforeAll, describe, it } from "jsr:@std/testing/bdd";
import { handleCreateVoteSubmission, openVoteCreationModal } from "./vote-creation.ts";
import type { SlackInteraction } from "./types.ts";
import { prisma, workspaceService } from "@db/prisma.ts";

describe(
  "Vote Creation Tests",
  { sanitizeResources: false, sanitizeOps: false },
  () => {
    // Setup test data
    const mockTeamId = "test-team-id-creation";
    const mockChannelId = "channel-creation-123";
    const mockUserId = "user-creation-456";
    let workspaceId: string;

    // Set up test data before running tests
    beforeAll(async () => {
      // Create a test workspace
      const workspace = await workspaceService.saveWorkspace(
        mockTeamId,
        "Test Team Creation",
        "xoxb-test-token-creation",
        "bot-user-creation-id",
      );

      // Store the created workspace ID
      workspaceId = workspace.id;
    });

    afterAll(async () => {
      // Clean up test data
      try {
        // Delete any votes created for this workspace
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

    describe("openVoteCreationModal", () => {
      it("returns error when workspace token not found", async () => {
        // Generate a random UUID for a non-existent workspace
        const nonExistentWorkspaceId = crypto.randomUUID();

        const response = await openVoteCreationModal(
          "trigger123",
          nonExistentWorkspaceId,
          mockChannelId,
          mockUserId,
        );

        assertEquals(response.status, 200);
        assertStringIncludes(
          response.body.text || "",
          "Workspace not found or authentication error",
        );
      });

      it("successfully opens the vote creation modal", async () => {
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

        try {
          const response = await openVoteCreationModal(
            "trigger123",
            workspaceId,
            mockChannelId,
            mockUserId,
          );

          assertEquals(response.status, 200);
          assertEquals(response.body, {});
        } finally {
          // Restore original fetch
          globalThis.fetch = originalFetch;
        }
      });

      it("handles API errors when opening modal", async () => {
        // Mock fetch to simulate an API error
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (
          _url: string | URL | Request,
          _init?: RequestInit,
        ) => {
          // Return an error response
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ ok: false, error: "invalid_trigger_id" }),
          } as Response);
        };

        try {
          const response = await openVoteCreationModal(
            "invalid-trigger",
            workspaceId,
            mockChannelId,
            mockUserId,
          );

          assertEquals(response.status, 200);
          assertStringIncludes(
            response.body.text || "",
            "Error opening vote creation modal",
          );
        } finally {
          // Restore original fetch
          globalThis.fetch = originalFetch;
        }
      });
    });

    describe("handleCreateVoteSubmission", () => {
      // Helper to create mock submissions with different values
      const createMockSubmission = (options: {
        title?: string;
        description?: string;
        optionsText?: string;
        creditsText?: string;
        allowedVoters?: string[];
      }): SlackInteraction => {
        const {
          title = "Test Vote",
          description = "Test description",
          optionsText = "Option 1\nOption 2\nOption 3",
          creditsText = "100",
          allowedVoters = [],
        } = options;

        return {
          type: "view_submission",
          user: { id: mockUserId },
          team: { id: mockTeamId },
          view: {
            id: "view123",
            callback_id: "create_vote_submission",
            private_metadata: JSON.stringify({
              channelId: mockChannelId,
              userId: mockUserId,
            }),
            state: {
              values: {
                vote_title: {
                  vote_title_input: {
                    type: "plain_text_input",
                    value: title,
                  },
                },
                vote_description: {
                  vote_description_input: {
                    type: "plain_text_input",
                    value: description,
                  },
                },
                vote_options: {
                  vote_options_input: {
                    type: "plain_text_input",
                    value: optionsText,
                  },
                },
                vote_credits: {
                  vote_credits_input: {
                    type: "plain_text_input",
                    value: creditsText,
                  },
                },
                vote_allowed_voters: allowedVoters.length > 0
                  ? {
                    vote_allowed_voters_input: {
                      type: "multi_users_select",
                      selected_users: allowedVoters,
                    },
                  }
                  : undefined,
              },
            },
          },
        } as unknown as SlackInteraction;
      };

      it("validates required fields", async () => {
        // Test with missing title
        const submissionMissingTitle = createMockSubmission({
          title: "",
        });

        const responseMissingTitle = await handleCreateVoteSubmission(
          submissionMissingTitle,
          workspaceId,
        );

        assertEquals(responseMissingTitle.status, 200);
        assertEquals(responseMissingTitle.body.response_action, "errors");
        assertStringIncludes(
          JSON.stringify(responseMissingTitle.body.errors),
          "Title is required",
        );

        // Test with missing options
        const submissionMissingOptions = createMockSubmission({
          optionsText: "",
        });

        const responseMissingOptions = await handleCreateVoteSubmission(
          submissionMissingOptions,
          workspaceId,
        );

        assertEquals(responseMissingOptions.status, 200);
        assertEquals(responseMissingOptions.body.response_action, "errors");
        assertStringIncludes(
          JSON.stringify(responseMissingOptions.body.errors),
          "At least one option is required",
        );
      });

      it("validates minimum number of options", async () => {
        // Test with only one option
        const submissionOneOption = createMockSubmission({
          optionsText: "Option 1",
        });

        const responseOneOption = await handleCreateVoteSubmission(
          submissionOneOption,
          workspaceId,
        );

        assertEquals(responseOneOption.status, 200);
        assertEquals(responseOneOption.body.response_action, "errors");
        assertStringIncludes(
          JSON.stringify(responseOneOption.body.errors),
          "At least two options are required",
        );
      });

      it("validates credits is a positive number", async () => {
        // Test with negative credits
        const submissionNegativeCredits = createMockSubmission({
          creditsText: "-10",
        });

        const responseNegativeCredits = await handleCreateVoteSubmission(
          submissionNegativeCredits,
          workspaceId,
        );

        assertEquals(responseNegativeCredits.status, 200);
        assertEquals(responseNegativeCredits.body.response_action, "errors");
        assertStringIncludes(
          JSON.stringify(responseNegativeCredits.body.errors),
          "Credits must be a positive number",
        );

        // Test with non-numeric credits
        const submissionNonNumericCredits = createMockSubmission({
          creditsText: "abc",
        });

        const responseNonNumericCredits = await handleCreateVoteSubmission(
          submissionNonNumericCredits,
          workspaceId,
        );

        assertEquals(responseNonNumericCredits.status, 200);
        assertEquals(responseNonNumericCredits.body.response_action, "errors");
        assertStringIncludes(
          JSON.stringify(responseNonNumericCredits.body.errors),
          "Credits must be a positive number",
        );
      });

      it("validates credits is a perfect square", async () => {
        // Test with credits that is not a perfect square
        const submissionNonSquareCredits = createMockSubmission({
          creditsText: "10",
        });

        const responseNonSquareCredits = await handleCreateVoteSubmission(
          submissionNonSquareCredits,
          workspaceId,
        );

        assertEquals(responseNonSquareCredits.status, 200);
        assertEquals(responseNonSquareCredits.body.response_action, "errors");
        assertStringIncludes(
          JSON.stringify(responseNonSquareCredits.body.errors),
          "Credits must be a perfect square",
        );
      });

      it("successfully creates a vote", async () => {
        // Mock the Slack API calls
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (
          url: string | URL | Request,
          _init?: RequestInit,
        ) => {
          if (url.toString().includes("conversations.join")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ ok: true }),
            } as Response);
          } else if (url.toString().includes("chat.postMessage")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ ok: true, ts: "1234567890.123456" }),
            } as Response);
          }

          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ ok: true }),
          } as Response);
        };

        try {
          // Proper submission with valid data
          const validSubmission = createMockSubmission({
            title: "Valid Test Vote",
            description: "This is a valid test vote",
            optionsText: "Option A\nOption B\nOption C",
            creditsText: "36", // A perfect square
            allowedVoters: ["user1", "user2"],
          });

          const response = await handleCreateVoteSubmission(
            validSubmission,
            workspaceId,
          );

          assertEquals(response.status, 200);
          assertEquals(response.body.response_action, "update");

          // Verify vote was created in the database
          const votes = await prisma.vote.findMany({
            where: {
              workspaceId: workspaceId,
              title: "Valid Test Vote",
            },
          });

          assertEquals(votes.length, 1);
          assertEquals(votes[0].title, "Valid Test Vote");
          assertEquals(votes[0].description, "This is a valid test vote");
          assertEquals((votes[0].options as string[]).length, 3);
          assertEquals(votes[0].creditsPerUser, 36);

          // Check the allowed voters
          const allowedVoters = votes[0].allowedVoters as string[];
          assertEquals(allowedVoters.length, 3); // user1, user2, and the creator (mockUserId)
          assertEquals(allowedVoters.includes(mockUserId), true);
          assertEquals(allowedVoters.includes("user1"), true);
          assertEquals(allowedVoters.includes("user2"), true);
        } finally {
          // Restore original fetch
          globalThis.fetch = originalFetch;
        }
      });

      it("handles errors when workspace token is not found", async () => {
        // Mock the database methods to simulate vote creation working but workspace token failing
        const originalGetWorkspaceToken = workspaceService.getWorkspaceToken;
        workspaceService.getWorkspaceToken = () => Promise.resolve(null);

        try {
          // Valid submission
          const validSubmission = createMockSubmission({
            title: "Test Vote with Workspace Token Error",
          });

          const response = await handleCreateVoteSubmission(
            validSubmission,
            workspaceId, // Use valid workspace ID but the mock will return null token
          );

          assertEquals(response.status, 200);
          assertEquals(
            typeof response.body.text,
            "string",
            "Response body should have a text property",
          );
          assertStringIncludes(
            response.body.text as string,
            "Workspace not found or authentication error",
          );
        } finally {
          // Restore original method
          workspaceService.getWorkspaceToken = originalGetWorkspaceToken;
        }
      });

      it("creates vote even if channel message fails", async () => {
        // Mock the Slack API calls - this time with chat.postMessage failing
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (
          url: string | URL | Request,
          _init?: RequestInit,
        ) => {
          if (url.toString().includes("conversations.join")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ ok: true }),
            } as Response);
          } else if (url.toString().includes("chat.postMessage")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ ok: false, error: "channel_not_found" }),
            } as Response);
          } else if (url.toString().includes("chat.postEphemeral")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ ok: true }),
            } as Response);
          }

          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ ok: true }),
          } as Response);
        };

        try {
          // Proper submission with valid data
          const validSubmission = createMockSubmission({
            title: "Vote With Channel Error",
            creditsText: "9", // A perfect square
          });

          const response = await handleCreateVoteSubmission(
            validSubmission,
            workspaceId,
          );

          assertEquals(response.status, 200);
          assertEquals(response.body.response_action, "update");

          // Verify vote was created in the database despite channel error
          const votes = await prisma.vote.findMany({
            where: {
              workspaceId: workspaceId,
              title: "Vote With Channel Error",
            },
          });

          assertEquals(votes.length, 1);
          assertEquals(votes[0].title, "Vote With Channel Error");
        } finally {
          // Restore original fetch
          globalThis.fetch = originalFetch;
        }
      });
    });
  },
);
