// @ts-types="generated/index.d.ts"
import { PrismaClient } from "generated/index.js";

// Interface for vote creation parameters
export interface CreateVoteParams {
  workspaceId: string;
  channelId: string;
  creatorId: string;
  title: string;
  description?: string;
  options: string[];
  allowedVoters?: string[] | null; // List of user IDs allowed to vote (null means everyone can vote)
  creditsPerUser?: number;
  endTime?: Date | null;
}

export class VotesService {
  private db: PrismaClient;

  constructor(db: PrismaClient) {
    this.db = db;
  }

  // Create a new vote
  async createVote(params: CreateVoteParams) {
    const {
      workspaceId,
      channelId,
      creatorId,
      title,
      description,
      options,
      allowedVoters = null,
      creditsPerUser = 100,
      endTime = null,
    } = params;

    const now = new Date();

    const result = await this.db.vote.create({
      data: {
        workspaceId,
        channelId,
        creatorId,
        title,
        description,
        options: options, // Prisma will serialize this to JSON
        allowedVoters: allowedVoters === null ? { setValue: null } : allowedVoters, // Handle null value differently for Prisma
        creditsPerUser,
        endTime,
        createdAt: now,
        updatedAt: now,
      },
    });

    return result;
  }

  // Get a vote by ID
  async getVoteById(id: string) {
    return await this.db.vote.findUnique({
      where: { id },
      include: {
        responses: true,
      },
    });
  }

  // Get all votes for a workspace
  async getVotesForWorkspace(workspaceId: string) {
    return await this.db.vote.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
  }

  // Get all votes for a channel
  async getVotesForChannel(workspaceId: string, channelId: string) {
    return await this.db.vote.findMany({
      where: {
        workspaceId,
        channelId,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // Record a user's vote
  async recordVoteResponse(
    voteId: string,
    userId: string,
    optionIndex: number,
    credits: number,
  ) {
    const now = new Date();

    return await this.db.voteResponse.upsert({
      where: {
        voteId_userId_optionIndex: {
          voteId,
          userId,
          optionIndex,
        },
      },
      update: {
        credits,
        updatedAt: now,
      },
      create: {
        voteId,
        userId,
        optionIndex,
        credits,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  // Get vote results
  async getVoteResults(voteId: string) {
    const vote = await this.db.vote.findUnique({
      where: { id: voteId },
      include: {
        responses: true,
      },
    });

    if (!vote) {
      throw new Error("Vote not found");
    }

    // Group by options and sum credits
    const results = [];
    const options = vote.options as string[];

    for (let i = 0; i < options.length; i++) {
      const optionResponses = vote.responses.filter((r) => r.optionIndex === i);
      const totalCredits = optionResponses.reduce((sum, r) => sum + r.credits, 0);

      results.push({
        option: options[i],
        totalCredits,
        votes: optionResponses.length,
      });
    }

    // Sort by total credits descending
    results.sort((a, b) => b.totalCredits - a.totalCredits);

    return {
      vote,
      results,
    };
  }

  // End a vote (set isEnded to true)
  async endVote(voteId: string) {
    return await this.db.vote.update({
      where: { id: voteId },
      data: {
        isEnded: true,
        updatedAt: new Date(),
      },
    });
  }
}
