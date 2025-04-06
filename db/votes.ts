// @ts-types="generated/index.d.ts"
import { PrismaClient } from "generated/index.js";
import { NotFoundError } from "@db/errors.ts";

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

  // Get a vote by ID or throw if not found
  async getVoteById(id: string) {
    try {
      return await this.db.vote.findUniqueOrThrow({
        where: { id },
        include: {
          responses: true,
        },
      });
    } catch (_error) {
      throw new NotFoundError(`Vote with ID ${id} not found`);
    }
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
        responses: {
          select: {
            optionIndex: true,
            credits: true,
            userId: true,
          },
        },
      },
    });

    if (!vote) {
      throw new NotFoundError("Vote not found");
    }

    const options = vote.options as string[];

    // Use Prisma's groupBy to aggregate vote responses by option
    const responseAggregations = await this.db.voteResponse.groupBy({
      by: ["optionIndex"],
      where: {
        voteId: voteId,
      },
      _sum: {
        credits: true,
      },
      _count: {
        userId: true,
      },
    });

    // Create results array with all options (even those with no votes)
    const results = options.map((option, index) => {
      const aggregation = responseAggregations.find((r) => r.optionIndex === index);

      return {
        option: option,
        totalCredits: aggregation?._sum.credits || 0,
        votes: aggregation?._count.userId || 0,
      };
    });

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
