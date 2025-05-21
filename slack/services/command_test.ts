import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { checkIfAppInChannel, handleQVoteCommand, SlackRequest } from "./command.ts";

// Tests for the command handler
Deno.test(
  "handleQVoteCommand responds to 'help' parameter with help info",
  async () => {
    // We can test the handleQVoteCommand function directly to avoid stubbing issues

    // Mock workspace object
    const mockWorkspace = {
      id: "workspace-id",
      createdAt: new Date(),
      updatedAt: new Date(),
      teamId: "T12345",
      teamName: "Test Team",
      accessToken: "xoxp-test-token",
      botUserId: "U12345",
    };

    // Create request with "help" text
    const helpRequest: SlackRequest = {
      command: "/qvote",
      text: "help",
      responseUrl: "https://hooks.slack.com/commands/T123/123/123",
      teamId: "T123",
      channelId: "C123",
      userId: "U123",
      triggerId: "trigger123",
    };

    // Call the function directly
    const result = await handleQVoteCommand(helpRequest, mockWorkspace);

    // Verify the result
    assertEquals(result.status, 200);
    assertEquals(result.body?.response_type, "ephemeral");

    // Check if the blocks array exists and has the right structure
    assertEquals(Array.isArray(result.body?.blocks), true);

    // Check header block (first block should be header)
    const headerBlock = result.body?.blocks?.[0];
    assertEquals(headerBlock?.type, "header");

    // Check that content block (second block) has useful help content
    const contentBlock = result.body?.blocks?.[1];
    assertEquals(contentBlock?.type, "section");

    // Check for specific texts in the response
    const helpText = JSON.stringify(result.body);
    assertStringIncludes(helpText, "QVote Help");
    assertStringIncludes(helpText, "QVote allows you to create");
    assertStringIncludes(helpText, "/qvote help");
  },
);

// Test for the checkIfAppInChannel function
Deno.test("checkIfAppInChannel detects if app is in channel", async () => {
  // Save original fetch function
  const originalFetch = globalThis.fetch;

  // Mock fetch for successful channel check
  globalThis.fetch = (_url: string | URL | Request, _init?: RequestInit) => {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, channel: { id: "C123", name: "general" } }),
    } as Response);
  };

  try {
    // Call the function
    const result = await checkIfAppInChannel("C123", "xoxp-test-token");

    // Verify the result
    assertEquals(result.isInChannel, true);
    assertEquals(result.error, undefined);
  } finally {
    // Restore original fetch
    globalThis.fetch = originalFetch;
  }
});

Deno.test("checkIfAppInChannel detects if app is not in channel", async () => {
  // Save original fetch function
  const originalFetch = globalThis.fetch;

  // Mock fetch for failed channel check
  globalThis.fetch = (_url: string | URL | Request, _init?: RequestInit) => {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: false, error: "not_in_channel" }),
    } as Response);
  };

  try {
    // Call the function
    const result = await checkIfAppInChannel("C123", "xoxp-test-token");

    // Verify the result
    assertEquals(result.isInChannel, false);
    assertEquals(result.error, "not_in_channel");
  } finally {
    // Restore original fetch
    globalThis.fetch = originalFetch;
  }
});

Deno.test(
  "handleQVoteCommand shows error when app is not in channel",
  async () => {
    // Mock workspace object
    const mockWorkspace = {
      id: "workspace-id",
      createdAt: new Date(),
      updatedAt: new Date(),
      teamId: "T12345",
      teamName: "Test Team",
      accessToken: "xoxp-test-token",
      botUserId: "U12345",
    };

    // Create request
    const request: SlackRequest = {
      command: "/qvote",
      text: "",
      responseUrl: "https://hooks.slack.com/commands/T123/123/123",
      teamId: "T123",
      channelId: "C123",
      userId: "U123",
      triggerId: "trigger123",
    };

    // Save original fetch function and mock it to simulate app not in channel
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (_url: string | URL | Request, _init?: RequestInit) => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: false, error: "not_in_channel" }),
      } as Response);
    };

    try {
      // Call the function
      const result = await handleQVoteCommand(request, mockWorkspace);

      // Verify the result - should have error about not being in channel
      assertEquals(result.status, 200);
      assertEquals(result.body?.response_type, "ephemeral");

      const responseText = JSON.stringify(result.body);
      assertStringIncludes(responseText, "App Not in Channel");
      assertStringIncludes(responseText, "/invite @qvote");
    } finally {
      // Restore original fetch function
      globalThis.fetch = originalFetch;
    }
  },
);
