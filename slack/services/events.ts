// Slack events handler
import logger from "@utils/logger.ts";
import { workspaceService } from "@db/prisma.ts";

export interface SlackEvent {
  type: string;
  event: {
    type: string;
    [key: string]: unknown;
  };
  team_id: string;
  api_app_id: string;
  event_id: string;
  event_time: number;
  [key: string]: unknown;
}

export interface SlackEventResponse {
  status: number;
  body: unknown;
}

/**
 * Route Slack events to appropriate handlers
 * @param payload Slack event payload
 * @returns Response to send back to Slack
 */
export async function handleSlackEvent(
  payload: SlackEvent,
): Promise<SlackEventResponse> {
  try {
    // Log the event for debugging
    logger.info("Received event:", {
      type: payload.type,
      event_type: payload.event?.type,
    });

    // URL verification is now handled directly in the route handler
    // This is just a fallback
    if (payload.type === "url_verification") {
      logger.info("Received URL verification challenge in handler");
      return {
        status: 200,
        body: { challenge: payload.challenge },
      };
    }

    // Handle app_uninstalled event
    if (payload.event?.type === "app_uninstalled") {
      await handleAppUninstalled(payload.team_id);
      return { status: 200, body: { ok: true } };
    }

    // Handle other events as needed
    logger.info(`Unhandled event type: ${payload.event?.type}`);
    return { status: 200, body: { ok: true } };
  } catch (error) {
    logger.error("Error handling Slack event:", error);
    return {
      status: 500,
      body: { error: "Internal server error" },
    };
  }
}

/**
 * Handle app_uninstalled event
 * @param teamId The ID of the team that uninstalled the app
 */
async function handleAppUninstalled(teamId: string): Promise<void> {
  try {
    logger.info(`App uninstalled from workspace: ${teamId}`);

    // Delete the workspace and associated data from the database
    const success = await workspaceService.deleteWorkspaceByTeamId(teamId);

    if (success) {
      logger.info(`Workspace ${teamId} deleted successfully`);
    } else {
      logger.error(`Failed to delete workspace ${teamId}`);
    }
  } catch (error) {
    logger.error(`Error handling app_uninstalled for team ${teamId}:`, error);
  }
}
