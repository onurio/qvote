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

  // Delete a workspace by team ID
  async deleteWorkspaceByTeamId(teamId: string): Promise<boolean> {
    try {
      await this.db.workspace.delete({
        where: { teamId },
      });
      return true;
    } catch (error) {
      console.error("Error deleting workspace:", error);
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
