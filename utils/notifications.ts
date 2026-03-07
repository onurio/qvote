import logger from "@utils/logger.ts";

export type NotificationEvent = "workspace_installed" | "vote_created" | "vote_ended";

/**
 * Sends an anonymized notification to NOTIFICATION_WEBHOOK_URL if configured.
 * No personally identifiable information is included in the payload.
 *
 * Compatible with ntfy.sh, Discord webhooks, Slack incoming webhooks, or any
 * service that accepts a POST with a JSON body.
 */
export async function notify(event: NotificationEvent): Promise<void> {
  const webhookUrl = Deno.env.get("NOTIFICATION_WEBHOOK_URL");
  if (!webhookUrl) return;

  const payload = {
    message: event,
    event,
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    logger.info("Notification sent", { event });
  } catch (error) {
    logger.warn("Failed to send notification", { event, error });
  }
}
