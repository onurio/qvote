import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { handleQVoteCommand, SlackRequest } from "./command.ts";

// This test just focuses on the "help" functionality we added
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
