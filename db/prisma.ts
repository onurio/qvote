// Import Prisma for Deno
// @ts-types="generated/index.d.ts"
import { PrismaClient } from "generated/index.js";

import { load } from "@std/dotenv";
import logger from "../utils/logger.ts";

await load({ export: true });

// Create Prisma client instance with standard configuration
export const prisma = new PrismaClient();

/**
 * Connects to the database with retry logic for Docker environments
 *
 * @param retries Maximum number of connection attempts
 * @param delay Delay between attempts in milliseconds
 * @returns Promise that resolves when connection is established
 */
export async function connectToDatabase(retries = 1, delay = 5000) {
  logger.info("Connecting to database...");
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Simple query to check connection
      logger.debug(`Attempting database connection...`);
      const result = await prisma.$queryRaw<
        [{ connection_test: number }]
      >`SELECT 1 as connection_test`;
      logger.info(
        `Database connection successful`,
        { status: result[0].connection_test === 1 },
      );
      return;
    } catch (error) {
      logger.error(
        `Database connection attempt ${attempt}/${retries} failed`,
        error,
      );

      if (attempt < retries) {
        logger.info(`Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        logger.error("All database connection attempts failed.");
        logger.error(
          "Please ensure PostgreSQL is running and .env is configured correctly.",
        );
        logger.error(
          "Run 'deno task setup-db' and 'deno task prisma:deploy' to set up the database.",
        );
        Deno.exit(1);
      }
    }
  }
}

/**
 * Closes the database connection gracefully
 */
export async function closeDatabase() {
  await prisma.$disconnect();
}
