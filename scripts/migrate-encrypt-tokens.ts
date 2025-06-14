#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write --allow-run --allow-net --allow-ffi

import { load } from "@std/dotenv";
import { closeDatabase, connectToDatabase, prisma } from "@db/prisma.ts";
import { tokenEncryption } from "@utils/encryption.ts";
import logger from "@utils/logger.ts";

// Load environment variables
await load({
  export: true,
  allowEmptyValues: true,
});

async function migrateTokens() {
  const dryRun = Deno.env.get("DRY_RUN") !== "false";

  if (dryRun) {
    logger.info("🔍 Starting token encryption migration (DRY RUN - no changes will be made)...");
    logger.info("💡 To perform actual migration, set DRY_RUN=false");
  } else {
    logger.info("🚀 Starting token encryption migration (LIVE MODE - changes will be made)...");
  }

  await connectToDatabase();
  const db = prisma;

  try {
    // Check if encryption is configured
    if (!Deno.env.get("ENCRYPTION_SECRET")) {
      logger.error(
        "ENCRYPTION_SECRET not set. Please set this environment variable before running migration.",
      );
      Deno.exit(1);
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
          logger.info(`✅ Workspace ${workspace.teamId} token is already encrypted`);
          alreadyEncryptedCount++;
          continue;
        }

        if (dryRun) {
          // In dry run mode, test encryption/decryption without saving
          logger.info(
            `🔄 Testing encryption for workspace ${workspace.teamId} (token length: ${workspace.accessToken.length} chars)`,
          );

          try {
            // Test encryption
            const encryptedToken = await tokenEncryption.encrypt(workspace.accessToken);
            logger.info(
              `  ✅ Encryption successful (encrypted length: ${encryptedToken.length} chars)`,
            );

            // Test decryption
            const decryptedToken = await tokenEncryption.decrypt(encryptedToken);

            if (decryptedToken === workspace.accessToken) {
              logger.info(`  ✅ Decryption successful - tokens match`);
            } else {
              throw new Error("Decrypted token doesn't match original");
            }

            logger.info(`  📝 Would update database for workspace ${workspace.teamId}`);
            encryptedCount++;
          } catch (testError) {
            logger.error(
              `  ❌ Encryption/decryption test failed for workspace ${workspace.teamId}:`,
              testError,
            );
            throw testError; // Re-throw to be caught by outer try-catch
          }
        } else {
          // Encrypt the token
          logger.info(`🔐 Encrypting token for workspace ${workspace.teamId}...`);
          const encryptedToken = await tokenEncryption.encrypt(workspace.accessToken);

          // Update the workspace
          await db.workspace.update({
            where: { id: workspace.id },
            data: { accessToken: encryptedToken },
          });

          logger.info(`✅ Successfully encrypted token for workspace ${workspace.teamId}`);
          encryptedCount++;
        }
      } catch (error) {
        logger.error(`❌ Failed to encrypt token for workspace ${workspace.teamId}:`, error);
        errorCount++;
      }
    }

    if (dryRun) {
      logger.info("🔍 Dry run complete!");
      logger.info(`Would encrypt: ${encryptedCount}`);
      logger.info(`Already encrypted: ${alreadyEncryptedCount}`);
      logger.info(`Errors: ${errorCount}`);
      logger.info("💡 To perform actual migration, set DRY_RUN=false");
    } else {
      logger.info("🎉 Migration complete!");
      logger.info(`Encrypted: ${encryptedCount}`);
      logger.info(`Already encrypted: ${alreadyEncryptedCount}`);
      logger.info(`Errors: ${errorCount}`);
    }

    if (errorCount > 0) {
      logger.warn("Some tokens failed to encrypt. Please check the logs and retry.");
      Deno.exit(1);
    }
  } catch (error) {
    logger.error("Migration failed:", error);
    Deno.exit(1);
  } finally {
    await closeDatabase();
  }
}

// Run migration
await migrateTokens();
