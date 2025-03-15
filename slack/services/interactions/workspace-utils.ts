import { prisma } from "../../../db/prisma.ts";
import logger from "../../../utils/logger.ts";

// Helper function to get workspace token
export async function getWorkspaceToken(workspaceId: string): Promise<string | null> {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    return workspace?.accessToken || null;
  } catch (error) {
    logger.error("Error getting workspace token", error);
    return null;
  }
}
