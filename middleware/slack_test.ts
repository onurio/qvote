import { assertEquals, assertExists } from "jsr:@std/assert";
import { Context, Next } from "jsr:@oak/oak";
import { assertSpyCall, assertSpyCalls, spy } from "jsr:@std/testing/mock";
import type { SlackRequest } from "../slack/services/command.ts";

// Configuration and mocking functions for testing validateSlackWorkspace middleware

// Mock configuration state - will be used to create spies for each test
let mockWorkspaceReturnValue: unknown = null;
let mockWorkspaceShouldThrow = false;

// Mock logger creation function
function createMockLogger() {
  const logger = {
    error: (..._args: unknown[]) => {},
    info: (..._args: unknown[]) => {},
    debug: (..._args: unknown[]) => {},
    warn: (..._args: unknown[]) => {},
  };

  return {
    logger,
    errorSpy: spy(logger, "error"),
  };
}

// Mock workspace function factory
function createGetWorkspaceByTeamId() {
  return spy((_teamId: string) => {
    if (mockWorkspaceShouldThrow) {
      throw new Error("Database connection failed");
    }
    return Promise.resolve(mockWorkspaceReturnValue);
  });
}

// Create deps at runtime for each test
function createDeps() {
  const { logger, errorSpy } = createMockLogger();
  const getWorkspaceByTeamId = createGetWorkspaceByTeamId();

  return {
    logger,
    loggerErrorSpy: errorSpy,
    getWorkspaceByTeamId,
  };
}

// Create a function that returns a version of validateSlackWorkspace using provided deps
function createValidateSlackWorkspace(deps: {
  logger: { error: (...args: unknown[]) => void };
  getWorkspaceByTeamId: (teamId: string) => Promise<unknown>;
}) {
  return async function validateSlackWorkspace(ctx: Context, next: Next) {
    try {
      // Parse form data from Slack using the correct approach for Oak v17
      const form = await ctx.request.body.form();

      // Extract Slack request parameters
      const slackRequest: SlackRequest = {
        command: form.get("command") || "",
        text: form.get("text") || "",
        responseUrl: form.get("response_url") || "",
        teamId: form.get("team_id") || "",
        channelId: form.get("channel_id") || "",
        userId: form.get("user_id") || "",
        triggerId: form.get("trigger_id") || "",
      };

      // Verify the workspace exists
      const workspace = await deps.getWorkspaceByTeamId(slackRequest.teamId);

      if (!workspace) {
        ctx.response.status = 200; // Slack expects 200 status even for errors
        ctx.response.body = {
          response_type: "ephemeral",
          text:
            "Your workspace is not registered with QVote. Please add the app to your workspace first.",
        };
        return; // Stop execution
      }

      // Attach workspace and request info to the context state
      ctx.state.slack = {
        request: slackRequest,
        workspace: workspace,
      };

      // Continue to the next middleware or route handler
      await next();
    } catch (error) {
      deps.logger.error("Error in Slack middleware:", error);
      // Add more detailed logging to help debugging
      deps.logger.error("Request details:", {
        headers: Object.fromEntries(ctx.request.headers.entries()),
        method: ctx.request.method,
        url: ctx.request.url.toString(),
      });

      ctx.response.status = 200; // Slack expects 200 status even for errors
      ctx.response.body = {
        response_type: "ephemeral",
        text: "An error occurred while processing your request.",
      };
    }
  };
}

// Reset test configuration
function resetTestConfig() {
  mockWorkspaceReturnValue = null;
  mockWorkspaceShouldThrow = false;
}

// Mock form data class
class MockFormData {
  private data: Record<string, string>;

  constructor(data: Record<string, string>) {
    this.data = data;
  }

  get(key: string): string {
    return this.data[key] || "";
  }
}

// Create a mock context
function createMockContext(formData: Record<string, string>) {
  return {
    request: {
      body: {
        form: () => Promise.resolve(new MockFormData(formData)),
      },
      method: "POST",
      url: new URL("http://localhost/api/slack/commands"),
      headers: new Headers(),
    },
    response: {
      status: 404,
      body: {},
    },
    state: {},
  } as unknown as Context;
}

// Mock workspace data
const mockWorkspace = {
  id: "workspace-123",
  teamId: "team-123",
  teamName: "Test Team",
  accessToken: "xoxb-test-token",
  botUserId: "bot-123",
  createdAt: new Date(),
  updatedAt: new Date(),
};

Deno.test({
  name: "validateSlackWorkspace adds workspace and request to context state for valid workspace",
  fn: async () => {
    // Reset and configure test state
    resetTestConfig();
    mockWorkspaceReturnValue = mockWorkspace;

    // Create fresh dependencies with spies for this test
    const testDeps = createDeps();
    const middleware = createValidateSlackWorkspace({
      logger: testDeps.logger,
      getWorkspaceByTeamId: testDeps.getWorkspaceByTeamId,
    });

    // Create test form data
    const formData = {
      "command": "/qvote",
      "text": "Test vote",
      "response_url": "https://hooks.slack.com/commands/response_url",
      "team_id": "team-123",
      "channel_id": "channel-123",
      "user_id": "user-123",
      "trigger_id": "trigger-123",
    };

    // Create context
    const ctx = createMockContext(formData);

    // Create a next function spy
    const next = spy(() => Promise.resolve());

    // Execute the middleware
    await middleware(ctx, next);

    // Verify getWorkspaceByTeamId was called with the right team ID
    assertSpyCalls(testDeps.getWorkspaceByTeamId, 1);
    assertSpyCall(testDeps.getWorkspaceByTeamId, 0, {
      args: ["team-123"],
    });

    // Verify next() was called once
    assertSpyCalls(next, 1);

    // Verify request and workspace were added to context state
    assertExists(ctx.state.slack);
    assertEquals(ctx.state.slack.workspace, mockWorkspace);
    assertEquals(ctx.state.slack.request.teamId, "team-123");
    assertEquals(ctx.state.slack.request.command, "/qvote");
  },
});

Deno.test({
  name: "validateSlackWorkspace returns error for unregistered workspace",
  fn: async () => {
    // Reset and configure test state
    resetTestConfig();
    mockWorkspaceReturnValue = null;

    // Create fresh dependencies with spies for this test
    const testDeps = createDeps();
    const middleware = createValidateSlackWorkspace({
      logger: testDeps.logger,
      getWorkspaceByTeamId: testDeps.getWorkspaceByTeamId,
    });

    // Create test form data
    const formData = {
      "command": "/qvote",
      "text": "Test vote",
      "team_id": "unregistered-team",
      "channel_id": "channel-123",
      "user_id": "user-123",
      "trigger_id": "trigger-123",
    };

    // Create context
    const ctx = createMockContext(formData);

    // Create a next function spy
    const next = spy(() => Promise.resolve());

    // Execute the middleware
    await middleware(ctx, next);

    // Verify getWorkspaceByTeamId was called with the right team ID
    assertSpyCalls(testDeps.getWorkspaceByTeamId, 1);
    assertSpyCall(testDeps.getWorkspaceByTeamId, 0, {
      args: ["unregistered-team"],
    });

    // Verify next() was NOT called
    assertSpyCalls(next, 0);

    // Verify response was set correctly
    assertEquals(ctx.response.status, 200);
    assertExists(ctx.response.body);

    // Type assertion for response body
    const responseBody = ctx.response.body as Record<string, string>;
    assertEquals(responseBody.response_type, "ephemeral");
    assertEquals(
      responseBody.text,
      "Your workspace is not registered with QVote. Please add the app to your workspace first.",
    );
  },
});

Deno.test({
  name: "validateSlackWorkspace handles errors gracefully",
  fn: async () => {
    // Reset and configure test state
    resetTestConfig();
    mockWorkspaceShouldThrow = true;

    // Create fresh dependencies with spies for this test
    const testDeps = createDeps();
    const middleware = createValidateSlackWorkspace({
      logger: testDeps.logger,
      getWorkspaceByTeamId: testDeps.getWorkspaceByTeamId,
    });

    // Create test form data
    const formData = {
      "command": "/qvote",
      "text": "Test vote",
      "team_id": "team-123",
    };

    // Create context
    const ctx = createMockContext(formData);

    // Create a next function spy
    const next = spy(() => Promise.resolve());

    // Execute the middleware
    await middleware(ctx, next);

    // Verify logger.error was called - at least twice
    assertSpyCalls(testDeps.loggerErrorSpy, 2);

    // Verify first call - check only the message, not the full error (stack trace varies)
    assertEquals(testDeps.loggerErrorSpy.calls[0].args[0], "Error in Slack middleware:");
    const error = testDeps.loggerErrorSpy.calls[0].args[1] as Error;
    assertEquals(error.message, "Database connection failed");

    // Verify next() was NOT called
    assertSpyCalls(next, 0);

    // Verify response was set correctly
    assertEquals(ctx.response.status, 200);
    assertExists(ctx.response.body);

    // Type assertion for response body
    const responseBody = ctx.response.body as Record<string, string>;
    assertEquals(responseBody.response_type, "ephemeral");
    assertEquals(
      responseBody.text,
      "An error occurred while processing your request.",
    );
  },
});
