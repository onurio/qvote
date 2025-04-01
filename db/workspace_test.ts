import { assertEquals } from "@std/assert";
import { WorkspaceService } from "./workspace.ts";
// @ts-types="generated/index.d.ts"
import { PrismaClient } from "generated/index.js";

// Mock workspace data
const mockWorkspaceData = {
  id: "1",
  teamId: "T12345",
  teamName: "Test Team",
  accessToken: "xoxb-test-token",
  botUserId: "U54321",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Create a typed mock for the Prisma client
const mockPrismaClient = {
  workspace: {
    upsert: (data: Record<string, unknown>) => ({
      ...mockWorkspaceData,
      ...((data.create as Record<string, unknown>) || {}),
      ...((data.update as Record<string, unknown>) || {}),
    }),
    findUnique: () => mockWorkspaceData,
    findMany: () => [mockWorkspaceData],
    delete: () => mockWorkspaceData,
  },
};

// Import the WorkspaceService class

// Create an instance of the WorkspaceService with the mock client
const workspaceService = new WorkspaceService(
  mockPrismaClient as unknown as PrismaClient,
);

Deno.test({
  name: "saveWorkspace creates or updates a workspace",
  fn: async () => {
    const result = await workspaceService.saveWorkspace(
      "T12345",
      "Test Team",
      "xoxb-test-token",
      "U54321",
    );

    // Verify result
    assertEquals(result.teamId, "T12345");
    assertEquals(result.teamName, "Test Team");
    assertEquals(result.accessToken, "xoxb-test-token");
    assertEquals(result.botUserId, "U54321");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "getWorkspaceByTeamId returns a workspace",
  fn: async () => {
    const result = await workspaceService.getWorkspaceByTeamId("T12345");

    // Verify result
    assertEquals(result?.teamId, "T12345");
    assertEquals(result?.teamName, "Test Team");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "getAllWorkspaces returns a list of workspaces",
  fn: async () => {
    const result = await workspaceService.getAllWorkspaces();

    // Verify result
    assertEquals(result.length, 1);
    assertEquals(result[0].teamId, "T12345");
    assertEquals(result[0].teamName, "Test Team");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "deleteWorkspaceByTeamId deletes a workspace",
  fn: async () => {
    const result = await workspaceService.deleteWorkspaceByTeamId("T12345");

    // Verify result
    assertEquals(result, true);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
