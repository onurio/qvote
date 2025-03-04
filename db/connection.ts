import sql from "./client.ts";

/**
 * Connects to the database with retry logic for Docker environments
 *
 * @param retries Maximum number of connection attempts
 * @param delay Delay between attempts in milliseconds
 * @returns Promise that resolves when connection is established
 */
export async function connectToDatabase(retries = 5, delay = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Simple query to check connection
      const result = await sql`SELECT 1 as connection_test`;
      console.log(
        `Database connection successful: ${result[0].connection_test === 1}`,
      );
      return;
    } catch (error) {
      console.error(
        `Database connection attempt ${attempt}/${retries} failed:`,
        error,
      );

      if (attempt < retries) {
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error("All database connection attempts failed.");
        console.error(
          "Please ensure PostgreSQL is running and .env is configured correctly.",
        );
        console.error(
          "Run 'deno task setup-db' and 'deno task migrate' to set up the database.",
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
  await sql.end();
}
