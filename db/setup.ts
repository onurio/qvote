import { load } from "@std/dotenv";
import postgres from "postgres";

// Load environment variables
await load({ export: true });

// Get database connection parameters from environment variables
const dbHost = Deno.env.get("DB_HOST") || "localhost";
const dbPort = parseInt(Deno.env.get("DB_PORT") || "5432");
const dbUser = Deno.env.get("DB_USER") || "postgres";
const dbPassword = Deno.env.get("DB_PASSWORD") || "postgres";
const dbName = Deno.env.get("DB_NAME") || "qvote";

// Connect to PostgreSQL server (not to a specific database)
const sql = postgres({
  host: dbHost,
  port: dbPort,
  username: dbUser,
  password: dbPassword,
  database: "postgres", // Connect to default postgres database first
});

try {
  console.log(`Creating database ${dbName} if it doesn't exist...`);

  // Check if database exists
  const result = await sql`
    SELECT 1 FROM pg_database WHERE datname = ${dbName}
  `;

  // Create database if it doesn't exist
  if (result.length === 0) {
    // Need to use text query for CREATE DATABASE
    await sql.unsafe(`CREATE DATABASE ${dbName}`);
    console.log(`Database ${dbName} created successfully!`);
  } else {
    console.log(`Database ${dbName} already exists.`);
  }

  console.log("Database setup complete! Now run 'deno task migrate' to create the tables.");
} catch (error) {
  console.error("Database setup error:", error);
} finally {
  await sql.end();
}
