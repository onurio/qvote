import { assertEquals } from "@std/assert";
import {
  containsSensitiveInfo,
  removeSensitiveInfo,
  sanitizeApiError,
  sanitizeError,
  sanitizeUserError,
} from "./error-sanitization.ts";

// Mock the environment for testing
const originalEnv = Deno.env.get("ENV");

function setEnvironment(env: string | undefined) {
  if (env === undefined) {
    Deno.env.delete("ENV");
  } else {
    Deno.env.set("ENV", env);
  }
}

Deno.test("sanitizeError in development mode", async (t) => {
  setEnvironment("development");

  await t.step("returns full error details for Error instances", () => {
    const error = new Error("Test error message");
    const result = sanitizeError(error);
    assertEquals(result.includes("Error: Test error message"), true);
  });

  await t.step("returns string representation for non-Error objects", () => {
    const result = sanitizeError("Simple string error");
    assertEquals(result, "Simple string error");
  });

  await t.step("includes stack trace when available", () => {
    const error = new Error("Test error");
    const result = sanitizeError(error);
    assertEquals(result.includes("Error: Test error"), true);
    // Stack trace format varies by runtime, just check it exists
    assertEquals(result.length > "Error: Test error".length, true);
  });

  // Restore original env
  setEnvironment(originalEnv);
});

Deno.test("sanitizeError in production mode", async (t) => {
  setEnvironment("production");

  await t.step("returns generic message for unknown errors", () => {
    const error = new Error("Sensitive database connection failed");
    const result = sanitizeError(error);
    assertEquals(result, "An unexpected error occurred");
  });

  await t.step("returns specific message for ValidationError", () => {
    const error = new Error("Invalid email format");
    error.name = "ValidationError";
    const result = sanitizeError(error);
    assertEquals(result, "Invalid input provided");
  });

  await t.step("returns specific message for UnauthorizedError", () => {
    const error = new Error("Invalid token");
    error.name = "UnauthorizedError";
    const result = sanitizeError(error);
    assertEquals(result, "Access denied");
  });

  await t.step("returns specific message for NotFoundError", () => {
    const error = new Error("User not found");
    error.name = "NotFoundError";
    const result = sanitizeError(error);
    assertEquals(result, "Resource not found");
  });

  await t.step("returns specific message for TimeoutError", () => {
    const error = new Error("Request timed out");
    error.name = "TimeoutError";
    const result = sanitizeError(error);
    assertEquals(result, "Request timeout");
  });

  await t.step("returns specific message for NetworkError", () => {
    const error = new Error("Network unreachable");
    error.name = "NetworkError";
    const result = sanitizeError(error);
    assertEquals(result, "Network error occurred");
  });

  await t.step("returns specific message for DatabaseError", () => {
    const error = new Error("Connection failed");
    error.name = "DatabaseError";
    const result = sanitizeError(error);
    assertEquals(result, "Database operation failed");
  });

  await t.step("returns specific message for Prisma errors", () => {
    const error1 = new Error("Prisma error");
    error1.name = "PrismaClientKnownRequestError";
    assertEquals(sanitizeError(error1), "Database operation failed");

    const error2 = new Error("Prisma error");
    error2.name = "PrismaClientUnknownRequestError";
    assertEquals(sanitizeError(error2), "Database operation failed");
  });

  await t.step("returns generic message for non-Error objects", () => {
    const result = sanitizeError({ some: "object" });
    assertEquals(result, "An unexpected error occurred");
  });

  // Restore original env
  setEnvironment(originalEnv);
});

Deno.test("sanitizeApiError in development mode", async (t) => {
  setEnvironment("development");

  await t.step("returns full error details", () => {
    const error = new Error("Test API error");
    const result = sanitizeApiError(error);
    assertEquals(result.error, "Test API error");
    assertEquals(result.code, "Error");
  });

  await t.step("handles non-Error objects", () => {
    const result = sanitizeApiError("String error");
    assertEquals(result.error, "String error");
    assertEquals(result.code, "UnknownError");
  });

  // Restore original env
  setEnvironment(originalEnv);
});

Deno.test("sanitizeApiError in production mode", async (t) => {
  setEnvironment("production");

  await t.step("returns sanitized ValidationError", () => {
    const error = new Error("Invalid input");
    error.name = "ValidationError";
    const result = sanitizeApiError(error);
    assertEquals(result.error, "Invalid input provided");
    assertEquals(result.code, "VALIDATION_ERROR");
  });

  await t.step("returns sanitized UnauthorizedError", () => {
    const error = new Error("No token");
    error.name = "UnauthorizedError";
    const result = sanitizeApiError(error);
    assertEquals(result.error, "Access denied");
    assertEquals(result.code, "UNAUTHORIZED");
  });

  await t.step("returns sanitized NotFoundError", () => {
    const error = new Error("Not found");
    error.name = "NotFoundError";
    const result = sanitizeApiError(error);
    assertEquals(result.error, "Resource not found");
    assertEquals(result.code, "NOT_FOUND");
  });

  await t.step("returns sanitized TimeoutError", () => {
    const error = new Error("Timeout");
    error.name = "TimeoutError";
    const result = sanitizeApiError(error);
    assertEquals(result.error, "Request timeout");
    assertEquals(result.code, "TIMEOUT");
  });

  await t.step("returns sanitized RateLimitError", () => {
    const error = new Error("Rate limit");
    error.name = "RateLimitError";
    const result = sanitizeApiError(error);
    assertEquals(result.error, "Too many requests");
    assertEquals(result.code, "RATE_LIMIT");
  });

  await t.step("returns generic error for unknown errors", () => {
    const error = new Error("Unknown");
    const result = sanitizeApiError(error);
    assertEquals(result.error, "Internal server error");
    assertEquals(result.code, "INTERNAL_ERROR");
  });

  await t.step("handles non-Error objects", () => {
    const result = sanitizeApiError("String error");
    assertEquals(result.error, "Internal server error");
    assertEquals(result.code, "INTERNAL_ERROR");
  });

  // Restore original env
  setEnvironment(originalEnv);
});

Deno.test("sanitizeUserError in development mode", async (t) => {
  setEnvironment("development");

  await t.step("returns original error message", () => {
    const error = new Error("Development error");
    const result = sanitizeUserError(error);
    assertEquals(result, "Development error");
  });

  await t.step("handles non-Error objects", () => {
    const result = sanitizeUserError("String error");
    assertEquals(result, "String error");
  });

  // Restore original env
  setEnvironment(originalEnv);
});

Deno.test("sanitizeUserError in production mode", async (t) => {
  setEnvironment("production");

  await t.step("returns user-friendly ValidationError message", () => {
    const error = new Error("Validation failed");
    error.name = "ValidationError";
    const result = sanitizeUserError(error);
    assertEquals(result, "Please check your input and try again.");
  });

  await t.step("returns user-friendly UnauthorizedError message", () => {
    const error = new Error("Unauthorized");
    error.name = "UnauthorizedError";
    const result = sanitizeUserError(error);
    assertEquals(result, "You don't have permission to perform this action.");
  });

  await t.step("returns user-friendly NotFoundError message", () => {
    const error = new Error("Not found");
    error.name = "NotFoundError";
    const result = sanitizeUserError(error);
    assertEquals(result, "The requested item could not be found.");
  });

  await t.step("returns user-friendly TimeoutError message", () => {
    const error = new Error("Timeout");
    error.name = "TimeoutError";
    const result = sanitizeUserError(error);
    assertEquals(result, "The request took too long. Please try again.");
  });

  await t.step("returns user-friendly NetworkError message", () => {
    const error = new Error("Network error");
    error.name = "NetworkError";
    const result = sanitizeUserError(error);
    assertEquals(result, "Unable to connect to Slack. Please try again later.");
  });

  await t.step("returns generic user-friendly message for unknown errors", () => {
    const error = new Error("Unknown error");
    const result = sanitizeUserError(error);
    assertEquals(
      result,
      "Something went wrong. Please try again or contact support if the problem persists.",
    );
  });

  await t.step("handles non-Error objects", () => {
    const result = sanitizeUserError({ error: "object" });
    assertEquals(
      result,
      "Something went wrong. Please try again or contact support if the problem persists.",
    );
  });

  // Restore original env
  setEnvironment(originalEnv);
});

Deno.test("containsSensitiveInfo", async (t) => {
  await t.step("detects password-related terms", () => {
    assertEquals(containsSensitiveInfo("Invalid password"), true);
    assertEquals(containsSensitiveInfo("PASSWORD_HASH"), true);
  });

  await t.step("detects token-related terms", () => {
    assertEquals(containsSensitiveInfo("Invalid token"), true);
    assertEquals(containsSensitiveInfo("ACCESS_TOKEN"), true);
  });

  await t.step("detects secret-related terms", () => {
    assertEquals(containsSensitiveInfo("client_secret"), true);
    assertEquals(containsSensitiveInfo("SECRET_KEY"), true);
  });

  await t.step("detects key-related terms", () => {
    assertEquals(containsSensitiveInfo("api_key"), true);
    assertEquals(containsSensitiveInfo("private key"), true);
  });

  await t.step("detects credential-related terms", () => {
    assertEquals(containsSensitiveInfo("Invalid credentials"), true);
    assertEquals(containsSensitiveInfo("CREDENTIAL_ERROR"), true);
  });

  await t.step("detects authorization-related terms", () => {
    assertEquals(containsSensitiveInfo("Authorization failed"), true);
    assertEquals(containsSensitiveInfo("Bearer token"), true);
  });

  await t.step("detects database connection strings", () => {
    assertEquals(containsSensitiveInfo("database connection failed"), true);
    assertEquals(containsSensitiveInfo("connection string error"), true);
  });

  await t.step("detects file system paths", () => {
    assertEquals(containsSensitiveInfo("file system error"), true);
    assertEquals(containsSensitiveInfo("internal path not found"), true);
  });

  await t.step("detects stack traces", () => {
    assertEquals(containsSensitiveInfo("stack trace follows"), true);
    assertEquals(containsSensitiveInfo("Stack Trace:"), true);
  });

  await t.step("returns false for safe messages", () => {
    assertEquals(containsSensitiveInfo("User not found"), false);
    assertEquals(containsSensitiveInfo("Invalid input"), false);
    assertEquals(containsSensitiveInfo("Request failed"), false);
  });
});

Deno.test("removeSensitiveInfo", async (t) => {
  await t.step("removes file paths", () => {
    const message = "Error at /home/user/project/file.ts line 42";
    const result = removeSensitiveInfo(message);
    assertEquals(result, "Error at [file] line 42");
  });

  await t.step("removes multiple file paths", () => {
    const message = "Failed to load /app/config.json and /app/data.js";
    const result = removeSensitiveInfo(message);
    assertEquals(result, "Failed to load [file] and [file]");
  });

  await t.step("removes stack traces", () => {
    const message = "Error occurred\n  at function1 (file.ts:10)\n  at function2 (file.ts:20)";
    const result = removeSensitiveInfo(message);
    assertEquals(result, "Error occurred");
  });

  await t.step("removes PostgreSQL connection strings", () => {
    const message = "Failed to connect to postgresql://user:pass@host:5432/db";
    const result = removeSensitiveInfo(message);
    assertEquals(result, "Failed to connect to [database_url]");
  });

  await t.step("removes long tokens and keys", () => {
    const message = "Invalid token: abcdef1234567890abcdef1234567890";
    const result = removeSensitiveInfo(message);
    assertEquals(result, "Invalid token: [redacted]");
  });

  await t.step("removes multiple sensitive items", () => {
    const message =
      "Error at /app/file.ts with token abc123def456ghi789jkl012 connecting to postgresql://localhost/db";
    const result = removeSensitiveInfo(message);
    assertEquals(result, "Error at [file] with token [redacted] connecting to [database_url]");
  });

  await t.step("preserves short strings", () => {
    const message = "Error code 404: Not found";
    const result = removeSensitiveInfo(message);
    assertEquals(result, "Error code 404: Not found");
  });

  await t.step("trims whitespace", () => {
    const message = "  Error message  \n  at stack trace  ";
    const result = removeSensitiveInfo(message);
    assertEquals(result, "Error message");
  });
});

// Restore original environment
Deno.test("cleanup", () => {
  setEnvironment(originalEnv);
});
