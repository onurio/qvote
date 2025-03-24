import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import { routeSlackInteraction } from "./router.ts";
import type { SlackInteraction } from "./types.ts";

// Test without mocking the handlers - just focus on the router logic itself
describe("routeSlackInteraction", () => {
  // Test the error handling for unknown action types
  it("handles unknown action_id gracefully", async () => {
    const payload: SlackInteraction = {
      type: "block_actions",
      actions: [
        {
          action_id: "unknown_action",
          value: "some-value",
          block_id: "actions",
          type: "button",
        },
      ],
      user: { id: "user123" },
      trigger_id: "trigger123",
      team: { id: "team123" },
      channel: { id: "channel123" },
    };

    const response = await routeSlackInteraction(payload, "workspace-123");

    assertEquals(response.status, 200);
    assertStringIncludes(response.body.text || "", "not yet supported");
  });

  it("handles block_actions with no actions gracefully", async () => {
    const payload: SlackInteraction = {
      type: "block_actions",
      actions: [],
      user: { id: "user123" },
      trigger_id: "trigger123",
      team: { id: "team123" },
      channel: { id: "channel123" },
    };

    const response = await routeSlackInteraction(payload, "workspace-123");

    assertEquals(response.status, 200);
    assertStringIncludes(response.body.text || "", "No action was provided");
  });

  it("handles unknown view submission types gracefully", async () => {
    const payload: SlackInteraction = {
      type: "view_submission",
      view: {
        id: "view123",
        callback_id: "unknown_submission",
        state: { values: {} },
      },
      user: { id: "user123" },
      trigger_id: "trigger123",
      team: { id: "team123" },
      channel: { id: "channel123" },
    };

    const response = await routeSlackInteraction(payload, "workspace-123");

    assertEquals(response.status, 200);
    assertStringIncludes(response.body.text || "", "not supported");
  });

  it("handles missing view data gracefully", async () => {
    const payload: SlackInteraction = {
      type: "view_submission",
      user: { id: "user123" },
      trigger_id: "trigger123",
      team: { id: "team123" },
      channel: { id: "channel123" },
    };

    const response = await routeSlackInteraction(payload, "workspace-123");

    assertEquals(response.status, 200);
    assertStringIncludes(response.body.text || "", "No view data found");
  });

  it("handles unknown interaction types gracefully", async () => {
    const payload: SlackInteraction = {
      type: "unknown_type",
      user: { id: "user123" },
      trigger_id: "trigger123",
      team: { id: "team123" },
      channel: { id: "channel123" },
    };

    const response = await routeSlackInteraction(payload, "workspace-123");

    assertEquals(response.status, 200);
    assertStringIncludes(response.body.text || "", "not yet supported");
  });
});
