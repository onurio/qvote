// @ts-types="generated/index.d.ts"
import { PrismaClient } from "generated/index.js";

// Save a workspace's OAuth token info to the database
export async function saveWorkspace(
  db: PrismaClient,
  teamId: string,
  teamName: string,
  accessToken: string,
  botUserId: string,
) {
  const now = new Date();

  const result = await db.workspace.upsert({
    where: { teamId },
    update: {
      teamName,
      accessToken,
      botUserId,
      updatedAt: now,
    },
    create: {
      teamId,
      teamName,
      accessToken,
      botUserId,
      createdAt: now,
      updatedAt: now,
    },
  });

  return result;
}

// Get a workspace by team ID
export async function getWorkspaceByTeamId(db: PrismaClient, teamId: string) {
  return await db.workspace.findUnique({
    where: { teamId },
  });
}

// Get all workspaces
export async function getAllWorkspaces(db: PrismaClient) {
  return await db.workspace.findMany({
    orderBy: { createdAt: "desc" },
  });
}

// Delete a workspace by team ID
export async function deleteWorkspaceByTeamId(
  db: PrismaClient,
  teamId: string,
): Promise<boolean> {
  try {
    await db.workspace.delete({
      where: { teamId },
    });
    return true;
  } catch (error) {
    console.error("Error deleting workspace:", error);
    return false;
  }
}
