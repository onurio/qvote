import { prisma } from "./prisma.ts";

// Interface for vote creation parameters
interface CreateVoteParams {
  workspaceId: string;
  channelId: string;
  creatorId: string;
  title: string;
  description?: string;
  options: string[];
  creditsPerUser?: number;
  endTime?: Date | null;
}

// Create a new vote
export async function createVote(params: CreateVoteParams) {
  const {
    workspaceId,
    channelId,
    creatorId,
    title,
    description,
    options,
    creditsPerUser = 100,
    endTime = null,
  } = params;

  const now = new Date();

  const result = await prisma.vote.create({
    data: {
      workspaceId,
      channelId,
      creatorId,
      title,
      description,
      options: options, // Prisma will serialize this to JSON
      creditsPerUser,
      endTime,
      createdAt: now,
      updatedAt: now,
    },
  });

  return result;
}

// Get a vote by ID
export async function getVoteById(id: string) {
  return await prisma.vote.findUnique({
    where: { id },
    include: {
      responses: true,
    },
  });
}

// Get all votes for a workspace
export async function getVotesForWorkspace(workspaceId: string) {
  return await prisma.vote.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
}

// Get all votes for a channel
export async function getVotesForChannel(workspaceId: string, channelId: string) {
  return await prisma.vote.findMany({
    where: {
      workspaceId,
      channelId,
    },
    orderBy: { createdAt: "desc" },
  });
}

// Record a user's vote
export async function recordVoteResponse(
  voteId: string,
  userId: string,
  optionIndex: number,
  credits: number,
) {
  const now = new Date();

  return await prisma.voteResponse.upsert({
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
export async function getVoteResults(voteId: string) {
  const vote = await prisma.vote.findUnique({
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
