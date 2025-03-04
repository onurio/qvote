import sql from "./client.ts";
import { load } from "@std/dotenv";

// Load environment variables
await load({ export: true });

console.log("Starting database migrations...");

try {
  // Create extension if it doesn't exist
  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;
  console.log("Created pgcrypto extension if it didn't exist");

  // Create workspaces table for storing Slack OAuth tokens
  await sql`
    CREATE TABLE IF NOT EXISTS workspaces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id TEXT NOT NULL UNIQUE,
      team_name TEXT NOT NULL,
      access_token TEXT NOT NULL,
      bot_user_id TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `;
  console.log("Created workspaces table");

  // Create votes table for storing quadratic votes
  await sql`
    CREATE TABLE IF NOT EXISTS votes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      options JSONB NOT NULL,
      credits_per_user INTEGER NOT NULL DEFAULT 100,
      start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      end_time TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `;
  console.log("Created votes table");

  // Create vote_responses table for storing user votes
  await sql`
    CREATE TABLE IF NOT EXISTS vote_responses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      vote_id UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      option_index INTEGER NOT NULL,
      credits INTEGER NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(vote_id, user_id, option_index)
    )
  `;
  console.log("Created vote_responses table");

  console.log("All migrations completed successfully!");
} catch (error) {
  console.error("Migration error:", error);
} finally {
  await sql.end();
}
