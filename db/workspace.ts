import { prisma } from "./prisma.ts";

// Save a workspace's OAuth token info to the database
export async function saveWorkspace(
  teamId: string,
  teamName: string,
  accessToken: string,
  botUserId: string,
) {
  const now = new Date();

  const result = await prisma.workspace.upsert({
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
export async function getWorkspaceByTeamId(teamId: string) {
  return await prisma.workspace.findUnique({
    where: { teamId },
  });
}

// Get all workspaces
export async function getAllWorkspaces() {
  return await prisma.workspace.findMany({
    orderBy: { createdAt: "desc" },
  });
}

// Delete a workspace by team ID
export async function deleteWorkspaceByTeamId(
  teamId: string,
): Promise<boolean> {
  try {
    await prisma.workspace.delete({
      where: { teamId },
    });
    return true;
  } catch (error) {
    console.error("Error deleting workspace:", error);
    return false;
  }
}
