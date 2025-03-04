// This file defines the database schema and types for TypeScript

// Type definitions for the workspace table
export interface Workspace {
  id: string;
  teamId: string;
  teamName: string;
  accessToken: string;
  botUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Type definitions for future votes table
export interface Vote {
  id: string;
  workspaceId: string;
  channelId: string;
  creatorId: string;
  title: string;
  description: string;
  options: string[];
  creditsPerUser: number;
  startTime: Date;
  endTime: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Type definitions for future vote responses table
export interface VoteResponse {
  id: string;
  voteId: string;
  userId: string;
  optionIndex: number;
  credits: number;
  createdAt: Date;
  updatedAt: Date;
}
