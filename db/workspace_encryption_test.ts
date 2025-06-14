import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import { stub } from "jsr:@std/testing/mock";
import { WorkspaceService } from "./workspace.ts";
import { TokenEncryption } from "../utils/encryption.ts";

// Mock Prisma client for testing
function createMockPrismaClient() {
  const mockData = new Map();

  return {
    workspace: {
      // deno-lint-ignore no-explicit-any
      upsert: (params: any) => {
        const workspace = {
          id: "test-workspace-id",
          teamId: params.where.teamId,
          teamName: params.update?.teamName || params.create.teamName,
          accessToken: params.update?.accessToken || params.create.accessToken,
          botUserId: params.update?.botUserId || params.create.botUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockData.set(params.where.teamId, workspace);
        return workspace;
      },

      // deno-lint-ignore no-explicit-any
      findUniqueOrThrow: (params: any) => {
        if (params.where.id) {
          // Find by workspace ID
          for (const workspace of mockData.values()) {
            if (workspace.id === params.where.id) {
              return workspace;
            }
          }
        }
        throw new Error("Workspace not found");
      },

      findMany: () => {
        return Array.from(mockData.values());
      },

      // deno-lint-ignore no-explicit-any
      update: (params: any) => {
        for (const workspace of mockData.values()) {
          if (workspace.id === params.where.id) {
            Object.assign(workspace, params.data);
            return workspace;
          }
        }
        throw new Error("Workspace not found");
      },
    },
    // deno-lint-ignore no-explicit-any
  } as unknown as any;
}

const _TEST_SECRET = "test-encryption-secret-32-chars!!";
const TEST_TOKEN = "xoxb-fake-1234567890-abcdefghijklmnopqrstuvwxyz";

Deno.test("WorkspaceService - Encrypts tokens when saving", async () => {
  const mockDb = createMockPrismaClient();
  const encryption = new TokenEncryption();
  const workspaceService = new WorkspaceService(mockDb, encryption);

  // Save a workspace
  const result = await workspaceService.saveWorkspace(
    "T12345",
    "Test Team",
    TEST_TOKEN,
    "U12345",
  );

  // The stored token should be encrypted (different from original)
  assertNotEquals(result.accessToken, TEST_TOKEN);

  // Should have encryption prefix
  assertEquals(result.accessToken.startsWith("enc:v1:"), true);

  // Direct decryption should work
  const decrypted = await encryption.decrypt(result.accessToken);
  assertEquals(decrypted, TEST_TOKEN);
});

Deno.test("WorkspaceService - Decrypts tokens when retrieving", async () => {
  const mockDb = createMockPrismaClient();
  const encryption = new TokenEncryption();
  const workspaceService = new WorkspaceService(mockDb, encryption);

  // Save a workspace (this will encrypt the token)
  const saved = await workspaceService.saveWorkspace(
    "T12345",
    "Test Team",
    TEST_TOKEN,
    "U12345",
  );

  // Retrieve the token (this should decrypt it)
  const retrievedToken = await workspaceService.getWorkspaceToken(saved.id);

  // Retrieved token should be the original plaintext
  assertEquals(retrievedToken, TEST_TOKEN);
});

Deno.test("WorkspaceService - Handles legacy unencrypted tokens", async () => {
  const mockDb = createMockPrismaClient();
  const encryption = new TokenEncryption();
  const workspaceService = new WorkspaceService(mockDb, encryption);

  // Manually insert a workspace with unencrypted token (simulating legacy data)
  const legacyToken = "xoxb-legacy-unencrypted-token";
  await mockDb.workspace.upsert({
    where: { teamId: "T12345" },
    update: {
      teamName: "Legacy Team",
      accessToken: legacyToken, // Not encrypted
      botUserId: "U12345",
      updatedAt: new Date(),
    },
    create: {
      teamId: "T12345",
      teamName: "Legacy Team",
      accessToken: legacyToken, // Not encrypted
      botUserId: "U12345",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // Retrieve the token - should work even though it's not encrypted
  const retrievedToken = await workspaceService.getWorkspaceToken("test-workspace-id");
  assertEquals(retrievedToken, legacyToken);
});

Deno.test("WorkspaceService - Works without encryption secret", async () => {
  const envStub = stub(Deno.env, "get", () => undefined);

  try {
    const mockDb = createMockPrismaClient();
    const encryption = new TokenEncryption();
    const workspaceService = new WorkspaceService(mockDb, encryption);

    // Save a workspace (should store token as plaintext)
    const saved = await workspaceService.saveWorkspace(
      "T12345",
      "Test Team",
      TEST_TOKEN,
      "U12345",
    );

    // Token should be stored as plaintext when no encryption secret
    assertEquals(saved.accessToken, TEST_TOKEN);

    // Retrieve should also return plaintext
    const retrieved = await workspaceService.getWorkspaceToken(saved.id);
    assertEquals(retrieved, TEST_TOKEN);
  } finally {
    envStub.restore();
  }
});

Deno.test("WorkspaceService - Multiple saves use different ciphertext", async () => {
  const mockDb = createMockPrismaClient();
  const encryption = new TokenEncryption();
  const workspaceService = new WorkspaceService(mockDb, encryption);

  // Save the same token multiple times (different team IDs)
  const saved1 = await workspaceService.saveWorkspace("T11111", "Team 1", TEST_TOKEN, "U11111");
  const saved2 = await workspaceService.saveWorkspace("T22222", "Team 2", TEST_TOKEN, "U22222");
  const saved3 = await workspaceService.saveWorkspace("T33333", "Team 3", TEST_TOKEN, "U33333");

  // Each encrypted token should be different (due to random IV)
  assertNotEquals(saved1.accessToken, saved2.accessToken);
  assertNotEquals(saved2.accessToken, saved3.accessToken);
  assertNotEquals(saved1.accessToken, saved3.accessToken);

  // But all should decrypt to the same original token
  const decrypted1 = await encryption.decrypt(saved1.accessToken);
  const decrypted2 = await encryption.decrypt(saved2.accessToken);
  const decrypted3 = await encryption.decrypt(saved3.accessToken);

  assertEquals(decrypted1, TEST_TOKEN);
  assertEquals(decrypted2, TEST_TOKEN);
  assertEquals(decrypted3, TEST_TOKEN);
});

Deno.test("WorkspaceService - Updates preserve encryption", async () => {
  const mockDb = createMockPrismaClient();
  const encryption = new TokenEncryption();
  const workspaceService = new WorkspaceService(mockDb, encryption);

  // Save initial workspace
  const _initial = await workspaceService.saveWorkspace(
    "T12345",
    "Initial Team",
    TEST_TOKEN,
    "U12345",
  );

  // Update with new token
  const newToken = "xoxb-fake-9876543210-zyxwvutsrqponmlkjihgfedcba";
  const updated = await workspaceService.saveWorkspace(
    "T12345", // Same team ID
    "Updated Team",
    newToken,
    "U54321",
  );

  // Updated token should be encrypted and different
  assertNotEquals(updated.accessToken, newToken);
  assertEquals(updated.accessToken.startsWith("enc:v1:"), true);

  // Should decrypt to new token
  const decrypted = await encryption.decrypt(updated.accessToken);
  assertEquals(decrypted, newToken);

  // Retrieved token should be the new one
  const retrieved = await workspaceService.getWorkspaceToken(updated.id);
  assertEquals(retrieved, newToken);
});
