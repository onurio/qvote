import { Router } from "jsr:@oak/oak";
import { closeDatabase, connectToDatabase, prisma } from "@db/prisma.ts";
import { tokenEncryption } from "@utils/encryption.ts";
import logger from "@utils/logger.ts";

const migrationRouter = new Router();

// Protected migration endpoint - add authentication as needed
migrationRouter.post("/admin/migrate-tokens", async (ctx) => {
  // Add your own authentication check here
  const authHeader = ctx.request.headers.get("Authorization");
  const expectedToken = Deno.env.get("MIGRATION_AUTH_TOKEN");

  if (!authHeader || !expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
    return;
  }

  try {
    logger.info("Starting token encryption migration...");

    await connectToDatabase();
    const db = prisma;

    // Check if encryption is configured
    if (!Deno.env.get("ENCRYPTION_SECRET")) {
      ctx.response.status = 400;
      ctx.response.body = { error: "ENCRYPTION_SECRET not configured" };
      return;
    }

    // Get all workspaces
    const workspaces = await db.workspace.findMany();
    logger.info(`Found ${workspaces.length} workspaces to check`);

    let encryptedCount = 0;
    let alreadyEncryptedCount = 0;
    let errorCount = 0;

    for (const workspace of workspaces) {
      try {
        // Check if token is already encrypted
        if (tokenEncryption.isEncrypted(workspace.accessToken)) {
          logger.info(`Workspace ${workspace.teamId} token is already encrypted`);
          alreadyEncryptedCount++;
          continue;
        }

        // Encrypt the token
        logger.info(`Encrypting token for workspace ${workspace.teamId}...`);
        const encryptedToken = await tokenEncryption.encrypt(workspace.accessToken);

        // Update the workspace
        await db.workspace.update({
          where: { id: workspace.id },
          data: { accessToken: encryptedToken },
        });

        logger.info(`Successfully encrypted token for workspace ${workspace.teamId}`);
        encryptedCount++;
      } catch (error) {
        logger.error(`Failed to encrypt token for workspace ${workspace.teamId}:`, error);
        errorCount++;
      }
    }

    await closeDatabase();

    const result = {
      success: true,
      encrypted: encryptedCount,
      alreadyEncrypted: alreadyEncryptedCount,
      errors: errorCount,
      total: workspaces.length,
    };

    logger.info("Migration complete!", result);
    ctx.response.body = result;
  } catch (error) {
    logger.error("Migration failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      error: "Migration failed",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

export default migrationRouter;
