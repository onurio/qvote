import { assertEquals, assertNotEquals, assertRejects } from "jsr:@std/assert";
import { stub } from "jsr:@std/testing/mock";
import { TokenEncryption } from "./encryption.ts";

// Test tokens
const TEST_TOKEN = "xoxb-fake-1234567890-abcdefghijklmnopqrstuvwxyz";

Deno.test("TokenEncryption - Basic encryption and decryption", async () => {
  const encryption = new TokenEncryption();

  // Test encryption
  const encrypted = await encryption.encrypt(TEST_TOKEN);

  // Encrypted token should be different from original
  assertNotEquals(encrypted, TEST_TOKEN);

  // Should have the encryption prefix
  assertEquals(encrypted.startsWith("enc:v1:"), true);

  // Test decryption
  const decrypted = await encryption.decrypt(encrypted);
  assertEquals(decrypted, TEST_TOKEN);
});

Deno.test("TokenEncryption - Handles unencrypted legacy tokens", async () => {
  const encryption = new TokenEncryption();

  // Legacy token (no prefix) should be returned as-is
  const legacyToken = "xoxb-legacy-token-12345";
  const result = await encryption.decrypt(legacyToken);
  assertEquals(result, legacyToken);

  // isEncrypted should return false for legacy tokens
  assertEquals(encryption.isEncrypted(legacyToken), false);
});

Deno.test("TokenEncryption - ensureEncrypted migrates legacy tokens", async () => {
  const encryption = new TokenEncryption();

  const legacyToken = "xoxb-legacy-token-12345";

  // First call should encrypt the token
  const encrypted1 = await encryption.ensureEncrypted(legacyToken);
  assertEquals(encryption.isEncrypted(encrypted1), true);

  // Second call should return the same encrypted token (already encrypted)
  const encrypted2 = await encryption.ensureEncrypted(encrypted1);
  assertEquals(encrypted1, encrypted2);

  // Both should decrypt to the original token
  const decrypted1 = await encryption.decrypt(encrypted1);
  const decrypted2 = await encryption.decrypt(encrypted2);
  assertEquals(decrypted1, legacyToken);
  assertEquals(decrypted2, legacyToken);
});

Deno.test("TokenEncryption - Works without encryption secret (backward compatibility)", async () => {
  // No encryption secret provided
  const envStub = stub(Deno.env, "get", () => undefined);

  try {
    const encryption = new TokenEncryption();

    // Should return plaintext when no secret is configured
    const token = "xoxb-plaintext-token";
    const encrypted = await encryption.encrypt(token);
    assertEquals(encrypted, token); // Should be unchanged

    const decrypted = await encryption.decrypt(token);
    assertEquals(decrypted, token); // Should be unchanged
  } finally {
    envStub.restore();
  }
});

Deno.test("TokenEncryption - Fails to decrypt when secret is missing", async () => {
  // First encrypt with a secret
  let encryption: TokenEncryption;
  let encrypted: string;

  {
    const envStub = stub(Deno.env, "get", (key: string) => {
      if (key === "ENCRYPTION_SECRET") return "test-secret-32-chars-for-testing!";
      return undefined;
    });

    try {
      encryption = new TokenEncryption();
      encrypted = await encryption.encrypt(TEST_TOKEN);
    } finally {
      envStub.restore();
    }
  }

  // Now try to decrypt without secret
  {
    const envStub = stub(Deno.env, "get", () => undefined);

    try {
      const encryptionNoSecret = new TokenEncryption();

      // Should throw when trying to decrypt encrypted token without secret
      await assertRejects(
        () => encryptionNoSecret.decrypt(encrypted),
        Error,
        "Cannot decrypt token: ENCRYPTION_SECRET not configured",
      );
    } finally {
      envStub.restore();
    }
  }
});

Deno.test("TokenEncryption - Each encryption produces different ciphertext", async () => {
  const encryption = new TokenEncryption();

  // Encrypt the same token multiple times
  const encrypted1 = await encryption.encrypt(TEST_TOKEN);
  const encrypted2 = await encryption.encrypt(TEST_TOKEN);
  const encrypted3 = await encryption.encrypt(TEST_TOKEN);

  // Each encryption should produce different ciphertext (due to random IV)
  assertNotEquals(encrypted1, encrypted2);
  assertNotEquals(encrypted2, encrypted3);
  assertNotEquals(encrypted1, encrypted3);

  // But all should decrypt to the same plaintext
  const decrypted1 = await encryption.decrypt(encrypted1);
  const decrypted2 = await encryption.decrypt(encrypted2);
  const decrypted3 = await encryption.decrypt(encrypted3);

  assertEquals(decrypted1, TEST_TOKEN);
  assertEquals(decrypted2, TEST_TOKEN);
  assertEquals(decrypted3, TEST_TOKEN);
});

Deno.test("TokenEncryption - Handles empty and special characters", async () => {
  const encryption = new TokenEncryption();

  // Test empty string
  const emptyEncrypted = await encryption.encrypt("");
  const emptyDecrypted = await encryption.decrypt(emptyEncrypted);
  assertEquals(emptyDecrypted, "");

  // Test string with special characters
  const specialToken = "xoxb-äöü-123-!@#$%^&*()_+-=[]{}|;:,.<>?";
  const specialEncrypted = await encryption.encrypt(specialToken);
  const specialDecrypted = await encryption.decrypt(specialEncrypted);
  assertEquals(specialDecrypted, specialToken);

  // Test very long token
  const longToken = "x".repeat(1000);
  const longEncrypted = await encryption.encrypt(longToken);
  const longDecrypted = await encryption.decrypt(longEncrypted);
  assertEquals(longDecrypted, longToken);
});

Deno.test("TokenEncryption - Detects corrupted encrypted tokens", async () => {
  const encryption = new TokenEncryption();

  // Create a corrupted encrypted token
  const validEncrypted = await encryption.encrypt(TEST_TOKEN);
  const corrupted = validEncrypted.substring(0, validEncrypted.length - 5) + "XXXXX";

  // Should throw when trying to decrypt corrupted token
  await assertRejects(
    () => encryption.decrypt(corrupted),
    Error,
    "Failed to decrypt token",
  );
});

Deno.test("TokenEncryption - Different secrets produce different results", async () => {
  const secret1 = "secret-one-32-characters-long!!!";
  const secret2 = "secret-two-32-characters-long!!!";

  let encrypted1: string;
  let encrypted2: string;

  // Encrypt with first secret
  {
    const envStub = stub(Deno.env, "get", (key: string) => {
      if (key === "ENCRYPTION_SECRET") return secret1;
      return undefined;
    });

    try {
      const encryption1 = new TokenEncryption();
      encrypted1 = await encryption1.encrypt(TEST_TOKEN);
    } finally {
      envStub.restore();
    }
  }

  // Encrypt with second secret
  {
    const envStub = stub(Deno.env, "get", (key: string) => {
      if (key === "ENCRYPTION_SECRET") return secret2;
      return undefined;
    });

    try {
      const encryption2 = new TokenEncryption();
      encrypted2 = await encryption2.encrypt(TEST_TOKEN);
    } finally {
      envStub.restore();
    }
  }

  // Results should be different
  assertNotEquals(encrypted1, encrypted2);

  // First encryption should not decrypt with second secret
  {
    const envStub = stub(Deno.env, "get", (key: string) => {
      if (key === "ENCRYPTION_SECRET") return secret2;
      return undefined;
    });

    try {
      const encryption2 = new TokenEncryption();

      await assertRejects(
        () => encryption2.decrypt(encrypted1),
        Error,
        "Failed to decrypt token",
      );
    } finally {
      envStub.restore();
    }
  }
});

Deno.test("TokenEncryption - isEncrypted correctly identifies token types", async () => {
  const encryption = new TokenEncryption();

  // Legacy tokens
  assertEquals(encryption.isEncrypted("xoxb-1234"), false);
  assertEquals(encryption.isEncrypted(""), false);
  assertEquals(encryption.isEncrypted("random-string"), false);

  // Encrypted tokens
  const encrypted = await encryption.encrypt(TEST_TOKEN);
  assertEquals(encryption.isEncrypted(encrypted), true);
  assertEquals(encryption.isEncrypted("enc:v1:somedata"), true);
});
