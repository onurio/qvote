import postgres from "postgres";

// Get database connection parameters from environment variables
const dbHost = Deno.env.get("DB_HOST") || "localhost";
const dbPort = parseInt(Deno.env.get("DB_PORT") || "5432");
const dbUser = Deno.env.get("DB_USER") || "postgres";
const dbPassword = Deno.env.get("DB_PASSWORD") || "postgres";
const dbName = Deno.env.get("DB_NAME") || "qvote";

// Create and export the database client
const sql = postgres({
  host: dbHost,
  port: dbPort,
  database: dbName,
  username: dbUser,
  password: dbPassword,
  max: 10, // Max number of connections
});

export default sql;
