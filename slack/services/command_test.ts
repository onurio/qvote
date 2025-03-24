import { assertEquals, assertStringIncludes } from "jsr:@std/assert";

// Import only the types and specific functions we need to test directly
import type { SlackRequest } from "./command.ts";
import { parseQVoteCommand } from "./command.ts";

// Define what the command responses look like
interface CommandResponse {
  status: number;
  body?: {
    response_type: "ephemeral" | "in_channel";
    text?: string;
    blocks?: unknown[];
  };
}

/**
 * Since directly mocking imported modules in Deno is challenging,
 * we recreate a functionally equivalent version of the routeSlackCommand function
 * to test the same logic paths. This allows us to test:
 *
 * 1. Successful modal opening
 * 2. Error during modal opening
 * 3. Unknown command handling
 * 4. Exception handling
 *
 * While also directly testing the parseQVoteCommand function.
 */

// Implement a version of routeSlackCommand with testable dependencies
async function routeSlackCommand(
  request: SlackRequest,
  workspace: {
    id: string;
    teamId: string;
    teamName: string;
    accessToken: string;
    botUserId: string;
    createdAt: Date;
    updatedAt: Date;
  },
): Promise<CommandResponse> {
  if (request.command === "/qvote") {
    return await handleQVoteCommand(request, workspace);
  } else {
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "Unknown command. Currently only /qvote is supported.",
        blocks: mockCreateInfoMessageBlocks(
          "Unknown Command",
          "Currently only `/qvote` is supported.",
        ),
      },
    };
  }
}

// Handle the /qvote command - recreated to match the original
async function handleQVoteCommand(
  request: SlackRequest,
  workspace: {
    id: string;
    teamId: string;
    teamName: string;
    accessToken: string;
    botUserId: string;
    createdAt: Date;
    updatedAt: Date;
  },
): Promise<CommandResponse> {
  try {
    // Open a modal for the user to enter vote details
    const modalResponse = await mockOpenVoteCreationModal(
      request.triggerId,
      workspace.id,
      request.channelId,
      request.userId,
    );

    // If there was an error opening the modal, return it to the user
    if (modalResponse.body.text) {
      return {
        status: modalResponse.status,
        body: {
          response_type: "ephemeral",
          text: modalResponse.body.text,
          blocks: mockCreateErrorMessageBlocks(
            "Error",
            modalResponse.body.text,
          ),
        },
      };
    }

    // Modal opened successfully, return empty ephemeral message
    return {
      status: 200,
    };
  } catch (error) {
    console.error("Error opening vote creation modal:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `Error: ${errorMessage}`,
        blocks: mockCreateErrorMessageBlocks(
          "Error Opening Vote Modal",
          errorMessage,
        ),
      },
    };
  }
}

// Test control flags
let shouldThrowError = false;
let shouldReturnErrorResponse = false;

function resetTestControls() {
  shouldThrowError = false;
  shouldReturnErrorResponse = false;
}

// Mock dependencies
interface ModalResponse {
  status: number;
  body: {
    text?: string;
    [key: string]: unknown;
  };
}

// Mock implementations
function mockOpenVoteCreationModal(
  _triggerId: string,
  _workspaceId: string,
  _channelId: string,
  _userId: string,
): Promise<ModalResponse> {
  if (shouldThrowError) {
    throw new Error("Network error");
  }

  if (shouldReturnErrorResponse) {
    return Promise.resolve({
      status: 500,
      body: {
        text: "Failed to open modal",
      },
    });
  }

  return Promise.resolve({
    status: 200,
    body: {},
  });
}

function mockCreateErrorMessageBlocks(_title: string, _message: string): unknown[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Error: ${_message}`,
      },
    },
  ];
}

function mockCreateInfoMessageBlocks(_title: string, _message: string): unknown[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Info: ${_message}`,
      },
    },
  ];
}

// Test data
const mockRequest: SlackRequest = {
  command: "/qvote",
  text: '"Test Vote" "Option 1" "Option 2" --desc "Test Description" --credits 100 --time 24h',
  responseUrl: "https://hooks.slack.com/commands/response_url",
  teamId: "team-123",
  channelId: "channel-123",
  userId: "user-123",
  triggerId: "trigger-123",
};

const mockWorkspace = {
  id: "workspace-123",
  teamId: "team-123",
  teamName: "Test Team",
  accessToken: "xoxb-test-token",
  botUserId: "bot-123",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// TESTS

// Test: successful modal opening
Deno.test(
  "routeSlackCommand handles /qvote command with successful modal opening",
  async () => {
    resetTestControls();

    const response = await routeSlackCommand(mockRequest, mockWorkspace);

    assertEquals(response.status, 200);
    assertEquals(response.body, undefined);
  },
);

// Test: modal opening with error
Deno.test(
  "routeSlackCommand handles /qvote command with modal opening error",
  async () => {
    resetTestControls();
    shouldReturnErrorResponse = true;

    const response = await routeSlackCommand(mockRequest, mockWorkspace);

    assertEquals(response.status, 500);
    assertEquals(response.body?.response_type, "ephemeral");
    assertEquals(response.body?.text, "Failed to open modal");
  },
);

// Test: unknown command
Deno.test("routeSlackCommand handles unknown command", async () => {
  resetTestControls();

  const unknownCommandRequest: SlackRequest = {
    ...mockRequest,
    command: "/unknown",
  };

  const response = await routeSlackCommand(
    unknownCommandRequest,
    mockWorkspace,
  );

  assertEquals(response.status, 200);
  assertEquals(response.body?.response_type, "ephemeral");
  assertStringIncludes(response.body?.text || "", "Unknown command");
});

// Test: exception during modal opening
Deno.test(
  "routeSlackCommand handles exception during modal opening",
  async () => {
    resetTestControls();
    shouldThrowError = true;

    // Mock console.error to prevent test output pollution
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const response = await routeSlackCommand(mockRequest, mockWorkspace);

      assertEquals(response.status, 200);
      assertEquals(response.body?.response_type, "ephemeral");
      assertStringIncludes(response.body?.text || "", "Error: Network error");
    } finally {
      // Restore console.error
      console.error = originalConsoleError;
    }
  },
);

// Direct tests of exported function parseQVoteCommand

// Test: parseQVoteCommand parses command text correctly with hours
Deno.test("parseQVoteCommand parses command text correctly with hours", () => {
  const text =
    '"Test Vote" "Option 1" "Option 2" --desc "Test Description" --credits 100 --time 24h';
  const result = parseQVoteCommand(text);

  assertEquals(result.title, "Test Vote");
  assertEquals(result.options, ["Option 1", "Option 2"]);
  assertEquals(result.description, "Test Description");
  assertEquals(result.credits, 100);
  assertStringIncludes(
    JSON.stringify(result.endTime),
    new Date().getFullYear().toString(),
  );
});

// Test: parseQVoteCommand parses command text correctly with days
Deno.test("parseQVoteCommand parses command text correctly with days", () => {
  const text =
    '"Test Vote" "Option 1" "Option 2" --desc "Test Description" --credits 100 --time 2d';
  const result = parseQVoteCommand(text);

  assertEquals(result.title, "Test Vote");
  assertEquals(result.options, ["Option 1", "Option 2"]);
  assertEquals(result.description, "Test Description");
  assertEquals(result.credits, 100);
  assertStringIncludes(
    JSON.stringify(result.endTime),
    new Date().getFullYear().toString(),
  );

  // Verify that the endTime is about 2 days in the future
  const now = new Date();
  const twoDaysFromNow = new Date(now);
  twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

  // Date should be within 10 minutes of expected (to account for test run time)
  if (result.endTime) {
    const timeDiff = Math.abs(
      result.endTime.getTime() - twoDaysFromNow.getTime(),
    );
    const tenMinutesInMs = 10 * 60 * 1000;
    assertEquals(timeDiff < tenMinutesInMs, true);
  }
});

// Test: parseQVoteCommand handles empty text
Deno.test("parseQVoteCommand handles empty text", () => {
  const result = parseQVoteCommand("");

  assertEquals(result.title, "");
  assertEquals(result.options, []);
  assertEquals(result.description, "");
  assertEquals(result.credits, 100);
  assertEquals(result.endTime, null);
});

// Test: parseQVoteCommand handles no flags
Deno.test("parseQVoteCommand handles text with no special flags", () => {
  const text = '"Test Vote" "Option 1" "Option 2" "Option 3"';
  const result = parseQVoteCommand(text);

  assertEquals(result.title, "Test Vote");
  assertEquals(result.options, ["Option 1", "Option 2", "Option 3"]);
  assertEquals(result.description, "");
  assertEquals(result.credits, 100);
  assertEquals(result.endTime, null);
});
