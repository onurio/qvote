import { assertEquals } from "jsr:@std/assert";
import { afterAll, beforeAll, describe, it } from "jsr:@std/testing/bdd";
import { createErrorResponse, findVoteMessageInChannel, haveAllVotersVoted } from "./vote-utils.ts";

describe("vote-utils", { sanitizeOps: false, sanitizeResources: false }, () => {
  describe("haveAllVotersVoted", () => {
    it("returns true when all allowed voters have voted", () => {
      const vote = {
        responses: [
          { userId: "user1", credits: 5 },
          { userId: "user2", credits: 10 },
          { userId: "user3", credits: 15 },
        ],
      };
      const allowedVoters = ["user1", "user2", "user3"];

      const result = haveAllVotersVoted(vote, allowedVoters);
      assertEquals(result, true);
    });

    it("returns false when some allowed voters haven't voted", () => {
      const vote = {
        responses: [
          { userId: "user1", credits: 5 },
          { userId: "user3", credits: 15 },
        ],
      };
      const allowedVoters = ["user1", "user2", "user3"];

      const result = haveAllVotersVoted(vote, allowedVoters);
      assertEquals(result, false);
    });

    it("only counts users who gave credits > 0", () => {
      const vote = {
        responses: [
          { userId: "user1", credits: 5 },
          { userId: "user2", credits: 0 }, // Doesn't count as voted
          { userId: "user3", credits: 15 },
        ],
      };
      const allowedVoters = ["user1", "user2", "user3"];

      const result = haveAllVotersVoted(vote, allowedVoters);
      assertEquals(result, false);
    });

    it("returns true when more people voted than were allowed", () => {
      const vote = {
        responses: [
          { userId: "user1", credits: 5 },
          { userId: "user2", credits: 10 },
          { userId: "user3", credits: 15 },
          { userId: "user4", credits: 20 },
        ],
      };
      const allowedVoters = ["user1", "user2", "user3"];

      const result = haveAllVotersVoted(vote, allowedVoters);
      assertEquals(result, true);
    });
  });

  describe("findVoteMessageInChannel", () => {
    const mockVote = { id: "vote123", channelId: "channel123" };
    const mockToken = "xoxb-mock-token";
    let originalFetch: typeof fetch;

    beforeAll(() => {
      originalFetch = globalThis.fetch;
    });

    afterAll(() => {
      globalThis.fetch = originalFetch;
    });

    it("returns message when found in channel history", async () => {
      globalThis.fetch = (
        _url: string | URL | Request,
        _init?: RequestInit,
      ) => {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              messages: [
                { text: "Some other message", ts: "1234.5678" },
                { text: `Vote: Test containing vote123`, ts: "2345.6789" },
                { text: "Another message", ts: "3456.7890" },
              ],
            }),
        } as Response);
      };

      const result = await findVoteMessageInChannel(mockVote, mockToken);
      assertEquals(result?.ts, "2345.6789");
    });

    it("finds message containing vote ID in blocks", async () => {
      globalThis.fetch = (
        _url: string | URL | Request,
        _init?: RequestInit,
      ) => {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              messages: [
                { text: "Some message", ts: "1234.5678" },
                {
                  text: "Vote message",
                  blocks: [{ text: { text: "Some vote" }, value: "vote123" }],
                  ts: "2345.6789",
                },
              ],
            }),
        } as Response);
      };

      const result = await findVoteMessageInChannel(mockVote, mockToken);
      assertEquals(result?.ts, "2345.6789");
    });

    it("returns null when vote not found in history", async () => {
      globalThis.fetch = (
        _url: string | URL | Request,
        _init?: RequestInit,
      ) => {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              messages: [
                { text: "Some other message", ts: "1234.5678" },
                { text: "Another message", ts: "3456.7890" },
              ],
            }),
        } as Response);
      };

      const result = await findVoteMessageInChannel(mockVote, mockToken);
      assertEquals(result, null);
    });

    it("returns null when Slack API returns error", async () => {
      globalThis.fetch = (
        _url: string | URL | Request,
        _init?: RequestInit,
      ) => {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: false,
              error: "channel_not_found",
            }),
        } as Response);
      };

      const result = await findVoteMessageInChannel(mockVote, mockToken);
      assertEquals(result, null);
    });

    it("returns null when fetch throws an error", async () => {
      globalThis.fetch = (
        _url: string | URL | Request,
        _init?: RequestInit,
      ) => {
        throw new Error("Network error");
      };

      const result = await findVoteMessageInChannel(mockVote, mockToken);
      assertEquals(result, null);
    });
  });

  describe("createErrorResponse", () => {
    it("creates error response with default title", () => {
      const response = createErrorResponse("Something went wrong");
      assertEquals(response.status, 200);
      assertEquals(response.body.text, "Something went wrong");
      assertEquals(response.body.response_type, "ephemeral");
      assertEquals(Array.isArray(response.body.blocks), true);
    });

    it("creates error response with custom title", () => {
      const response = createErrorResponse("Access denied", "Permission Error");
      assertEquals(response.status, 200);
      assertEquals(response.body.text, "Access denied");
      assertEquals(response.body.response_type, "ephemeral");
      assertEquals(Array.isArray(response.body.blocks), true);
    });
  });

  // Tests for the remaining functions require more complex setup and mocking
  // of API calls. This demonstrates the pattern for testing the utility functions.
});
