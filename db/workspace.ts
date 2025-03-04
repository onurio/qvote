import sql from "./client.ts";
import { Workspace } from "./schema.ts";

// Save a workspace's OAuth token info to the database
export async function saveWorkspace(
  teamId: string,
  teamName: string,
  accessToken: string,
  botUserId: string,
): Promise<Workspace> {
  const now = new Date();
  
  const result = await sql`
    INSERT INTO workspaces (
      team_id, team_name, access_token, bot_user_id, created_at, updated_at
    ) VALUES (
      ${teamId}, ${teamName}, ${accessToken}, ${botUserId}, ${now}, ${now}
    )
    ON CONFLICT (team_id) 
    DO UPDATE SET
      team_name = ${teamName},
      access_token = ${accessToken},
      bot_user_id = ${botUserId},
      updated_at = ${now}
    RETURNING id, team_id as "teamId", team_name as "teamName", 
      access_token as "accessToken", bot_user_id as "botUserId",
      created_at as "createdAt", updated_at as "updatedAt"
  `;
  
  return result[0] as Workspace;
}

// Get a workspace by team ID
export async function getWorkspaceByTeamId(teamId: string): Promise<Workspace | null> {
  const result = await sql`
    SELECT 
      id, team_id as "teamId", team_name as "teamName", 
      access_token as "accessToken", bot_user_id as "botUserId",
      created_at as "createdAt", updated_at as "updatedAt"
    FROM workspaces
    WHERE team_id = ${teamId}
  `;
  
  return result.length > 0 ? (result[0] as Workspace) : null;
}

// Get all workspaces
export async function getAllWorkspaces(): Promise<Workspace[]> {
  const result = await sql`
    SELECT 
      id, team_id as "teamId", team_name as "teamName", 
      access_token as "accessToken", bot_user_id as "botUserId",
      created_at as "createdAt", updated_at as "updatedAt"
    FROM workspaces
    ORDER BY created_at DESC
  `;
  
  return result as Workspace[];
}

// Delete a workspace by team ID
export async function deleteWorkspaceByTeamId(teamId: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM workspaces
    WHERE team_id = ${teamId}
    RETURNING id
  `;
  
  return result.length > 0;
}