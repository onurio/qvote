import { crypto } from "jsr:@std/crypto";
import { decodeBase64, encodeBase64 } from "jsr:@std/encoding/base64";
import logger from "@utils/logger.ts";

// Prefix to identify encrypted tokens
const ENCRYPTION_PREFIX = "enc:v1:";

export class TokenEncryption {
  private key: CryptoKey | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Don't start initialization immediately
  }

  private ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeKey();
    }
    return this.initPromise;
  }

  private async initializeKey(): Promise<void> {
    try {
      const secret = Deno.env.get("ENCRYPTION_SECRET");
      if (!secret) {
        logger.warn("ENCRYPTION_SECRET not set, tokens will be stored unencrypted");
        return;
      }

      // Derive a key from the secret
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"],
      );

      this.key = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: encoder.encode("qvote-token-salt"),
          iterations: 100000,
          hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    } catch (error) {
      logger.error("Failed to initialize encryption key:", error);
    }
  }

  async encrypt(plaintext: string): Promise<string> {
    // Wait for initialization to complete
    await this.ensureInitialized();

    // If no key, return plaintext (backward compatibility)
    if (!this.key) {
      return plaintext;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(plaintext);

      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // Encrypt
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        this.key,
        data,
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      // Return with prefix to identify encrypted tokens
      return ENCRYPTION_PREFIX + encodeBase64(combined);
    } catch (error) {
      logger.error("Encryption failed:", error);
      // Fallback to plaintext
      return plaintext;
    }
  }

  async decrypt(ciphertext: string): Promise<string> {
    // Wait for initialization to complete
    await this.ensureInitialized();

    // Check if it's an encrypted token
    if (!ciphertext.startsWith(ENCRYPTION_PREFIX)) {
      // It's an unencrypted legacy token
      return ciphertext;
    }

    // If no key but token is encrypted, we have a problem
    if (!this.key) {
      throw new Error("Cannot decrypt token: ENCRYPTION_SECRET not configured");
    }

    try {
      // Remove prefix
      const base64Data = ciphertext.substring(ENCRYPTION_PREFIX.length);
      const combined = decodeBase64(base64Data);

      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      // Decrypt
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        this.key,
        encrypted,
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      logger.error("Decryption failed:", error);
      throw new Error("Failed to decrypt token");
    }
  }

  // Utility method to check if a token is encrypted
  isEncrypted(token: string): boolean {
    return token.startsWith(ENCRYPTION_PREFIX);
  }

  // Migration helper - encrypt a token if it's not already encrypted
  async ensureEncrypted(token: string): Promise<string> {
    if (this.isEncrypted(token)) {
      return token;
    }
    return await this.encrypt(token);
  }
}

// Export singleton instance
export const tokenEncryption = new TokenEncryption();
