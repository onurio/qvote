import { assertEquals } from "@std/assert";
import { VotesService } from "./votes.ts";
// @ts-types="generated/index.d.ts"
import { PrismaClient } from "generated/index.js";

// Mock vote data
const mockVoteData = {
  id: "vote-123",
  workspaceId: "workspace-123",
  channelId: "channel-123",
  creatorId: "creator-123",
  title: "Test Vote",
  description: "This is a test vote",
  options: ["Option 1", "Option 2", "Option 3"],
  allowedVoters: null,
  creditsPerUser: 100,
  endTime: null,
  isEnded: false,
  startTime: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  responses: [],
};

const mockVoteResponses = [
  {
    id: "response-1",
    voteId: "vote-123",
    userId: "user-1",
    optionIndex: 0,
    credits: 16, // 4 votes
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "response-2",
    voteId: "vote-123",
    userId: "user-2",
    optionIndex: 1,
    credits: 25, // 5 votes
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "response-3",
    voteId: "vote-123",
    userId: "user-3",
    optionIndex: 0,
    credits: 9, // 3 votes
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// Create a typed mock for the Prisma client
// This is a type-safe approach to mocking the Prisma client
const mockPrismaClient = {
  vote: {
    create: (data: Record<string, unknown>) => ({
      ...mockVoteData,
      ...((data.data as Record<string, unknown>) || {}),
    }),
    findUnique: () => ({
      ...mockVoteData,
      responses: mockVoteResponses,
    }),
    update: (data: Record<string, unknown>) => ({
      ...mockVoteData,
      ...((data.data as Record<string, unknown>) || {}),
      isEnded: true,
    }),
    findMany: () => [mockVoteData],
  },
  voteResponse: {
    upsert: (data: Record<string, unknown>) => ({
      id: `response-${data.optionIndex}`,
      ...((data.create as Record<string, unknown>) || {}),
    }),
  },
};

// Create an instance of the VotesService with the mock client
const votesService = new VotesService(
  mockPrismaClient as unknown as PrismaClient,
);

Deno.test({
  name: "createVote creates a new vote",
  fn: async () => {
    const result = await votesService.createVote({
      workspaceId: "workspace-123",
      channelId: "channel-123",
      creatorId: "creator-123",
      title: "Test Vote",
      description: "This is a test vote",
      options: ["Option 1", "Option 2", "Option 3"],
    });

    // Verify result
    assertEquals(result.title, "Test Vote");
    assertEquals(result.description, "This is a test vote");
    assertEquals(result.options, ["Option 1", "Option 2", "Option 3"]);
    assertEquals(result.creditsPerUser, 100); // Default value
    assertEquals(result.isEnded, false); // Default value
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "getVoteById returns a vote with responses",
  fn: async () => {
    const result = await votesService.getVoteById("vote-123");

    // Verify result
    assertEquals(result?.id, "vote-123");
    assertEquals(result?.title, "Test Vote");
    assertEquals(result?.responses.length, 3);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "endVote sets isEnded to true",
  fn: async () => {
    const result = await votesService.endVote("vote-123");

    // Verify result
    assertEquals(result.isEnded, true);
    assertEquals(result.id, "vote-123");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "getVoteResults calculates quadratic voting results correctly",
  fn: async () => {
    const result = await votesService.getVoteResults("vote-123");

    // Verify vote details
    assertEquals(result.vote.id, "vote-123");
    assertEquals(result.vote.title, "Test Vote");

    // Verify results are calculated and sorted correctly
    assertEquals(result.results.length, 3);

    // Total credits should be 25 and 25 for the two options with votes
    // The result array is sorted by totalCredits, so we'll check both options
    // We have to be less specific about the order since it can vary
    const hasOption1 = result.results.some(
      (r) => r.option === "Option 1" && r.totalCredits === 25,
    );
    const hasOption2 = result.results.some(
      (r) => r.option === "Option 2" && r.totalCredits === 25,
    );
    assertEquals(hasOption1, true, "Should have Option 1 with 25 credits");
    assertEquals(hasOption2, true, "Should have Option 2 with 25 credits");

    // Option 3 should have 0 total credits (0 votes)
    // We know it will be last in the sorted array
    assertEquals(result.results[2].option, "Option 3");
    assertEquals(result.results[2].totalCredits, 0);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "recordVoteResponse stores user votes correctly",
  fn: async () => {
    const result = await votesService.recordVoteResponse(
      "vote-123",
      "user-1",
      1,
      36,
    );

    // Verify result
    assertEquals(result.voteId, "vote-123");
    assertEquals(result.userId, "user-1");
    assertEquals(result.optionIndex, 1);
    assertEquals(result.credits, 36);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
