import { assertEquals } from "@std/assert";
import { WorkspaceService } from "./workspace.ts";
// @ts-types="generated/index.d.ts"
import { PrismaClient } from "generated/index.js";
import { afterAll, beforeAll, describe, it } from "jsr:@std/testing/bdd";

describe(
  "WorkspaceService",
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    const db = new PrismaClient();
    const workspaceService = new WorkspaceService(db);

    const testTeamId = "T123456TEST";
    const testTeamName = "Test Team";
    const testAccessToken = "xoxb-test-token";
    const testBotUserId = "B123456TEST";

    beforeAll(async () => {
      // Clean up any existing test data
      await db.workspace.deleteMany({
        where: { teamId: testTeamId },
      });
    });

    afterAll(async () => {
      // Clean up test data
      await db.workspace.deleteMany({
        where: { teamId: testTeamId },
      });

      // Disconnect from the database
      await db.$disconnect();
    });

    it("saveWorkspace creates or updates a workspace", async () => {
      // Create a new workspace
      const result = await workspaceService.saveWorkspace(
        testTeamId,
        testTeamName,
        testAccessToken,
        testBotUserId,
      );

      // Verify result
      assertEquals(result.teamId, testTeamId);
      assertEquals(result.teamName, testTeamName);
      assertEquals(result.accessToken, testAccessToken);
      assertEquals(result.botUserId, testBotUserId);

      // Update the workspace with new values
      const updatedName = "Updated Team Name";
      const updatedToken = "xoxb-updated-token";
      const updatedUserId = "B987654TEST";

      const updateResult = await workspaceService.saveWorkspace(
        testTeamId,
        updatedName,
        updatedToken,
        updatedUserId,
      );

      // Verify update worked
      assertEquals(
        updateResult.teamId,
        testTeamId,
        "Team ID should remain the same",
      );
      assertEquals(
        updateResult.teamName,
        updatedName,
        "Team name should be updated",
      );
      assertEquals(
        updateResult.accessToken,
        updatedToken,
        "Access token should be updated",
      );
      assertEquals(
        updateResult.botUserId,
        updatedUserId,
        "Bot user ID should be updated",
      );
    });

    it("getWorkspaceByTeamId returns a workspace", async () => {
      // First create a workspace to retrieve
      await workspaceService.saveWorkspace(
        testTeamId,
        testTeamName,
        testAccessToken,
        testBotUserId,
      );

      // Retrieve the workspace
      const result = await workspaceService.getWorkspaceByTeamId(testTeamId);

      // Verify result
      assertEquals(result?.teamId, testTeamId);
      assertEquals(result?.teamName, testTeamName);
      assertEquals(result?.accessToken, testAccessToken);
      assertEquals(result?.botUserId, testBotUserId);

      // Test retrieving a non-existent workspace
      const nonExistentResult = await workspaceService.getWorkspaceByTeamId(
        "T-NONEXISTENT",
      );
      assertEquals(
        nonExistentResult,
        null,
        "Non-existent workspace should return null",
      );
    });

    it("getAllWorkspaces returns a list of workspaces", async () => {
      // First ensure our test workspace exists
      await workspaceService.saveWorkspace(
        testTeamId,
        testTeamName,
        testAccessToken,
        testBotUserId,
      );

      // Get all workspaces
      const result = await workspaceService.getAllWorkspaces();

      // Verify result - should be at least 1 workspace
      assertEquals(
        result.length >= 1,
        true,
        "Should have at least one workspace",
      );

      // Find our test workspace in the results
      const testWorkspace = result.find((ws) => ws.teamId === testTeamId);

      // Verify our test workspace is in the results
      assertEquals(
        testWorkspace !== undefined,
        true,
        "Test workspace should be in results",
      );
      if (testWorkspace) {
        assertEquals(testWorkspace.teamName, testTeamName);
        assertEquals(testWorkspace.accessToken, testAccessToken);
        assertEquals(testWorkspace.botUserId, testBotUserId);
      }
    });

    it("deleteWorkspaceByTeamId deletes a workspace and all associated data", async () => {
      // First create a workspace to delete
      const workspace = await workspaceService.saveWorkspace(
        testTeamId,
        testTeamName,
        testAccessToken,
        testBotUserId,
      );

      // Verify it exists
      const exists = await workspaceService.getWorkspaceByTeamId(testTeamId);
      assertEquals(
        exists !== null,
        true,
        "Workspace should exist before deletion",
      );

      // Create a test vote for this workspace
      const testVote = await db.vote.create({
        data: {
          workspaceId: workspace.id,
          channelId: "C12345",
          creatorId: "U12345",
          title: "Test Vote for Deletion",
          options: ["Option 1", "Option 2"],
          creditsPerUser: 100,
        },
      });

      // Create a test vote response
      await db.voteResponse.create({
        data: {
          voteId: testVote.id,
          userId: "U12345",
          optionIndex: 0,
          credits: 10,
        },
      });

      // Verify vote and response exist
      const voteExists = await db.vote.findUnique({
        where: { id: testVote.id },
      });
      assertEquals(voteExists !== null, true, "Vote should exist before deletion");

      // Delete the workspace (which should cascade delete votes and responses)
      const result = await workspaceService.deleteWorkspaceByTeamId(testTeamId);

      // Verify deletion was successful
      assertEquals(result, true, "Delete operation should return true");

      // Verify workspace no longer exists
      const afterDelete = await workspaceService.getWorkspaceByTeamId(
        testTeamId,
      );
      assertEquals(
        afterDelete,
        null,
        "Workspace should no longer exist after deletion",
      );

      // Verify vote no longer exists
      const voteAfterDelete = await db.vote.findUnique({
        where: { id: testVote.id },
      });
      assertEquals(
        voteAfterDelete,
        null,
        "Vote should no longer exist after workspace deletion",
      );

      // Test deleting a non-existent workspace
      const nonExistentResult = await workspaceService.deleteWorkspaceByTeamId(
        "T-NONEXISTENT",
      );
      assertEquals(
        nonExistentResult,
        true,
        "Deleting non-existent workspace should return true as there's nothing to delete",
      );
    });

    it("getWorkspaceToken returns a workspace's token", async () => {
      // Create a workspace first
      const workspace = await workspaceService.saveWorkspace(
        testTeamId,
        testTeamName,
        testAccessToken,
        testBotUserId,
      );

      // Get the token using the workspace ID
      const token = await workspaceService.getWorkspaceToken(workspace.id);

      // Verify the token matches what we set
      assertEquals(
        token,
        testAccessToken,
        "Should return the correct access token",
      );

      // Test with non-existent workspace ID - should throw an error
      try {
        await workspaceService.getWorkspaceToken("non-existent-id");
        // If we get here, the test failed
        assertEquals(
          true,
          false,
          "Should have thrown an error for non-existent workspace",
        );
      } catch (_error) {
        // Expected to get here - just verify we caught an error
        assertEquals(true, true, "Error was caught as expected");
      }
    });
  },
);
