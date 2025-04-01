import { assertSpyCallArgs, assertSpyCalls, stub } from "jsr:@std/testing/mock";
import { assertEquals } from "@std/assert/equals";
import { spy } from "jsr:@std/testing/mock";
import { describe, it } from "jsr:@std/testing/bdd";
import { checkAndAutoEndVote } from "./vote-auto-end.ts";
import { votesService, workspaceService } from "@db/prisma.ts";
import { haveAllVotersVoted } from "@slack/services/interactions/vote-utils.ts";
// @ts-types="generated/index.d.ts"

// Helper to create properly structured vote responses
const createResponse = (userId: string, optionIndex: number, credits: number) => ({
  id: `response-${userId}-${optionIndex}`,
  voteId: "vote-123",
  userId,
  optionIndex,
  credits,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Create a properly structured mock vote
const createMockVote = (overrides = {}) => {
  const defaultVote = {
    id: "vote-123",
    workspaceId: "workspace-123",
    channelId: "channel-123",
    creatorId: "creator-123",
    title: "Test Vote",
    description: "This is a test vote",
    options: ["Option 1", "Option 2"],
    allowedVoters: ["user-123", "user-456"],
    creditsPerUser: 100,
    isEnded: false,
    responses: [
      createResponse("user-123", 0, 10),
      createResponse("user-456", 1, 20),
    ],
    startTime: new Date(),
    endTime: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return { ...defaultVote, ...overrides };
};

describe("checkAndAutoEndVote", () => {
  it("returns early if vote not found", async () => {
    // Mock vote service to return null
    using getVoteByIdStub = stub(votesService, "getVoteById", () => Promise.resolve(null));
    using endVoteSpy = spy(votesService, "endVote");
    using getWorkspaceTokenSpy = spy(workspaceService, "getWorkspaceToken");

    await checkAndAutoEndVote("non-existent-vote-id", "user-123");

    // Check that getVoteById was called once
    assertSpyCalls(getVoteByIdStub, 1);
    // No other methods should be called
    assertSpyCalls(endVoteSpy, 0);
    assertSpyCalls(getWorkspaceTokenSpy, 0);
  });

  it("returns early if vote is already ended", async () => {
    // Mock vote service to return vote with isEnded=true
    const endedVote = createMockVote({ isEnded: true, endTime: new Date() });

    using getVoteByIdStub = stub(votesService, "getVoteById", () => Promise.resolve(endedVote));
    using endVoteSpy = spy(votesService, "endVote");
    using getWorkspaceTokenSpy = spy(workspaceService, "getWorkspaceToken");

    await checkAndAutoEndVote("vote-123", "user-123");

    // Check that getVoteById was called with correct vote ID
    assertSpyCallArgs(getVoteByIdStub, 0, ["vote-123"]);
    // No other methods should be called
    assertSpyCalls(endVoteSpy, 0);
    assertSpyCalls(getWorkspaceTokenSpy, 0);
  });

  it("returns early if no allowed voters", async () => {
    // Mock vote service to return vote with null allowedVoters
    const noAllowedVotersVote = createMockVote({ allowedVoters: null });

    using getVoteByIdStub = stub(
      votesService,
      "getVoteById",
      () => Promise.resolve(noAllowedVotersVote),
    );
    using endVoteSpy = spy(votesService, "endVote");
    using getWorkspaceTokenSpy = spy(workspaceService, "getWorkspaceToken");

    await checkAndAutoEndVote("vote-123", "user-123");

    // Check that getVoteById was called once
    assertSpyCalls(getVoteByIdStub, 1);
    // No other methods should be called
    assertSpyCalls(endVoteSpy, 0);
    assertSpyCalls(getWorkspaceTokenSpy, 0);
  });

  it("returns early if empty allowed voters array", async () => {
    // Mock vote service to return vote with empty allowedVoters array
    const emptyAllowedVotersVote = createMockVote({ allowedVoters: [] });

    using getVoteByIdStub = stub(
      votesService,
      "getVoteById",
      () => Promise.resolve(emptyAllowedVotersVote),
    );
    using endVoteSpy = spy(votesService, "endVote");
    using getWorkspaceTokenSpy = spy(workspaceService, "getWorkspaceToken");

    await checkAndAutoEndVote("vote-123", "user-123");

    // Check that getVoteById was called once
    assertSpyCalls(getVoteByIdStub, 1);
    // No other methods should be called
    assertSpyCalls(endVoteSpy, 0);
    assertSpyCalls(getWorkspaceTokenSpy, 0);
  });

  it("tests haveAllVotersVoted function", () => {
    // Mock vote data with minimal structure needed by haveAllVotersVoted
    const vote = {
      responses: [
        { userId: "user-123", credits: 10 },
        { userId: "user-456", credits: 5 },
      ],
    };
    const allowedVoters = ["user-123", "user-456"];

    // Check if all voters have voted
    const allVoted = haveAllVotersVoted(vote, allowedVoters);
    // Assert that all voters have voted
    assertEquals(allVoted, true);

    // Test not all voters have voted
    const vote2 = {
      responses: [{ userId: "user-123", credits: 10 }],
    };
    const allVoted2 = haveAllVotersVoted(vote2, allowedVoters);
    assertEquals(allVoted2, false);
  });

  it("returns early if not all voters have voted yet", async () => {
    // We need to modify the original function's behavior to simulate not all voters voted
    const voteWithSomeVoters = createMockVote({
      // Only one voter has voted, but there are two allowed voters
      responses: [createResponse("user-123", 0, 10)],
    });

    using getVoteByIdStub = stub(
      votesService,
      "getVoteById",
      () => Promise.resolve(voteWithSomeVoters),
    );
    using endVoteSpy = spy(votesService, "endVote");
    using getWorkspaceTokenSpy = spy(workspaceService, "getWorkspaceToken");

    await checkAndAutoEndVote("vote-123", "user-456");

    // Check that getVoteById was called once
    assertSpyCalls(getVoteByIdStub, 1);
    // endVote should not be called since not all voters have voted
    assertSpyCalls(endVoteSpy, 0);
    assertSpyCalls(getWorkspaceTokenSpy, 0);
  });

  it("ends vote when all voters have voted", async () => {
    // Mock vote service to return a vote where all allowed voters have already voted
    const voteWithAllVoters = createMockVote();

    using getVoteByIdStub = stub(
      votesService,
      "getVoteById",
      () => Promise.resolve(voteWithAllVoters),
    );
    using endVoteSpy = stub(
      votesService,
      "endVote",
      () => Promise.resolve({ ...voteWithAllVoters, isEnded: true }),
    );
    using getWorkspaceTokenStub = stub(
      workspaceService,
      "getWorkspaceToken",
      () => Promise.resolve("xoxb-test-token"),
    );

    await checkAndAutoEndVote("vote-123", "user-456");

    // Check that all required methods were called
    assertSpyCallArgs(getVoteByIdStub, 0, ["vote-123"]);
    assertSpyCalls(endVoteSpy, 1);
    assertSpyCalls(getWorkspaceTokenStub, 1);

    // Verify the correct arguments were passed
    assertEquals(endVoteSpy.calls[0].args[0], "vote-123");
    assertEquals(getWorkspaceTokenStub.calls[0].args[0], "workspace-123");
  });

  it("returns early if workspace token not found", async () => {
    // Mock vote service to return a vote where all voters have voted
    const voteWithAllVoters = createMockVote();

    using getVoteByIdStub = stub(
      votesService,
      "getVoteById",
      () => Promise.resolve(voteWithAllVoters),
    );
    using endVoteSpy = stub(
      votesService,
      "endVote",
      () => Promise.resolve({ ...voteWithAllVoters, isEnded: true }),
    );
    // Mock getWorkspaceToken to return null (token not found)
    using getWorkspaceTokenStub = stub(
      workspaceService,
      "getWorkspaceToken",
      () => Promise.resolve(null),
    );

    await checkAndAutoEndVote("vote-123", "user-456");

    // Check that methods were called correctly
    assertSpyCalls(getVoteByIdStub, 1);
    assertSpyCalls(endVoteSpy, 1);
    assertSpyCalls(getWorkspaceTokenStub, 1);

    // Verify the correct arguments were passed
    assertEquals(endVoteSpy.calls[0].args[0], "vote-123");
    assertEquals(getWorkspaceTokenStub.calls[0].args[0], "workspace-123");
  });

  it("handles errors gracefully", async () => {
    // Mock getVoteById to throw an error
    using getVoteByIdStub = stub(
      votesService,
      "getVoteById",
      () => Promise.reject(new Error("Test error")),
    );
    using endVoteSpy = spy(votesService, "endVote");
    using getWorkspaceTokenSpy = spy(workspaceService, "getWorkspaceToken");

    await checkAndAutoEndVote("vote-123", "user-123");

    // Check that getVoteById was called once
    assertSpyCalls(getVoteByIdStub, 1);
    // Other methods should not be called
    assertSpyCalls(endVoteSpy, 0);
    assertSpyCalls(getWorkspaceTokenSpy, 0);
  });
});
