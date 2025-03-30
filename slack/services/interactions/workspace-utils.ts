import logger from "@utils/logger.ts";
// @ts-types="generated/index.d.ts"
import { PrismaClient } from "generated/index.js";

// Helper function to get workspace token
export async function getWorkspaceToken(
  db: PrismaClient,
  workspaceId: string,
): Promise<string | null> {
  try {
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
    });
    return workspace?.accessToken || null;
  } catch (error) {
    logger.error("Error getting workspace token", error);
    return null;
  }
}
