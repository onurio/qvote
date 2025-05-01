// @ts-types="generated/index.d.ts"
import { PrismaClient } from "generated/index.js";
import logger from "@utils/logger.ts";
import { WorkspaceNotFoundError } from "@db/errors.ts";
import { PrismaKnownRequestError } from "@prisma/client/runtime";

export class WorkspaceService {
  private db: PrismaClient;

  constructor(db: PrismaClient) {
    this.db = db;
  }

  // Save a workspace's OAuth token info to the database
  async saveWorkspace(
    teamId: string,
    teamName: string,
    accessToken: string,
    botUserId: string,
  ) {
    const now = new Date();

    const result = await this.db.workspace.upsert({
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
  async getWorkspaceByTeamId(teamId: string) {
    return await this.db.workspace.findUnique({
      where: { teamId },
    });
  }

  // Get all workspaces
  async getAllWorkspaces() {
    return await this.db.workspace.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  // Delete a workspace and all its associated data by team ID
  async deleteWorkspaceByTeamId(teamId: string): Promise<boolean> {
    try {
      // First, find the workspace to get its ID
      const workspace = await this.db.workspace.findUnique({
        where: { teamId },
        select: { id: true },
      });

      if (!workspace) {
        logger.info(
          `Workspace with teamId ${teamId} not found, nothing to delete`,
        );
        return true; // Nothing to delete, so operation is successful
      }

      // With Prisma, we could use cascading deletes via the schema
      // But for more controlled deletion and logging we can do it explicitly
      logger.info(`Deleting workspace ${teamId} and all associated data`);

      // Delete the workspace and all associated data
      // The cascade delete defined in the schema will handle vote responses
      await this.db.workspace.delete({
        where: { teamId },
      });

      logger.info(
        `Workspace ${teamId} and associated data deleted successfully`,
      );
      return true;
    } catch (error) {
      logger.error("Error deleting workspace:", error);
      return false;
    }
  }

  async getWorkspaceToken(workspaceId: string): Promise<string> {
    try {
      const workspace = await this.db.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
      });
      return workspace.accessToken;
    } catch (error: PrismaKnownRequestError) {
      if (error.code === "P2025") {
        // Record not found
        throw new WorkspaceNotFoundError(
          `Workspace with ID ${workspaceId} not found.`,
        );
      }
      logger.error(
        `Error fetching workspace token for ID ${workspaceId}: ${error}`,
      );
      throw new Error(`Error fetching workspace token`);
    }
  }
}
