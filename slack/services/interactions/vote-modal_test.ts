import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import { handleOpenVoteModal } from "./vote-modal.ts";
import type { SlackInteraction } from "./types.ts";

// Test without trying to mock the imported modules
describe("handleOpenVoteModal", () => {
  // Basic setup for the mock Slack action
  const mockAction = {
    action_id: "open_vote_modal",
    block_id: "actions_block",
    value: "vote_vote-123",
    type: "button",
  };

  const mockPayload: SlackInteraction = {
    type: "block_actions",
    actions: [mockAction],
    user: { id: "user-456" },
    trigger_id: "trigger123",
    team: { id: "team-123" },
    channel: { id: "channel-123" },
  };

  // Test error cases that don't require mocking the database
  it("returns error when no vote ID is provided", async () => {
    const actionWithoutValue = {
      ...mockAction,
      value: undefined,
    };

    const response = await handleOpenVoteModal(
      actionWithoutValue,
      mockPayload,
      "workspace-123",
    );

    assertEquals(response.status, 200);
    assertStringIncludes(response.body.text || "", "No vote ID was provided");
  });
});
