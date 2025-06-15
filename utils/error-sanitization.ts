import logger from "@utils/logger.ts";

/**
 * Sanitizes error messages to prevent information leakage in production
 */
export function sanitizeError(error: unknown, context?: string): string {
  const isProduction = Deno.env.get("ENV") === "production";

  // In development, return full error details
  if (!isProduction) {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
    }
    return String(error);
  }

  // In production, return generic messages based on error type
  if (error instanceof Error) {
    // Log the full error for debugging
    logger.error(`Error in ${context || "unknown context"}:`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    // Return sanitized message based on error type
    switch (error.name) {
      case "ValidationError":
        return "Invalid input provided";
      case "UnauthorizedError":
        return "Access denied";
      case "NotFoundError":
        return "Resource not found";
      case "TimeoutError":
        return "Request timeout";
      case "NetworkError":
        return "Network error occurred";
      case "DatabaseError":
      case "PrismaClientKnownRequestError":
      case "PrismaClientUnknownRequestError":
        return "Database operation failed";
      default:
        return "An unexpected error occurred";
    }
  }

  // For non-Error objects, just return generic message
  logger.error(`Non-Error thrown in ${context || "unknown context"}:`, error);
  return "An unexpected error occurred";
}

/**
 * Sanitizes error for API responses
 */
export function sanitizeApiError(error: unknown, context?: string): {
  error: string;
  code?: string;
} {
  const isProduction = Deno.env.get("ENV") === "production";

  if (!isProduction) {
    return {
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof Error ? error.name : "UnknownError",
    };
  }

  // Log the full error
  logger.error(`API Error in ${context || "unknown context"}:`, error);

  if (error instanceof Error) {
    switch (error.name) {
      case "ValidationError":
        return { error: "Invalid input provided", code: "VALIDATION_ERROR" };
      case "UnauthorizedError":
        return { error: "Access denied", code: "UNAUTHORIZED" };
      case "NotFoundError":
        return { error: "Resource not found", code: "NOT_FOUND" };
      case "TimeoutError":
        return { error: "Request timeout", code: "TIMEOUT" };
      case "RateLimitError":
        return { error: "Too many requests", code: "RATE_LIMIT" };
      default:
        return { error: "Internal server error", code: "INTERNAL_ERROR" };
    }
  }

  return { error: "Internal server error", code: "INTERNAL_ERROR" };
}

/**
 * Sanitizes errors for user-facing messages in Slack
 */
export function sanitizeUserError(error: unknown, context?: string): string {
  const isProduction = Deno.env.get("ENV") === "production";

  if (!isProduction) {
    return error instanceof Error ? error.message : String(error);
  }

  logger.error(`User Error in ${context || "unknown context"}:`, error);

  if (error instanceof Error) {
    switch (error.name) {
      case "ValidationError":
        return "Please check your input and try again.";
      case "UnauthorizedError":
        return "You don't have permission to perform this action.";
      case "NotFoundError":
        return "The requested item could not be found.";
      case "TimeoutError":
        return "The request took too long. Please try again.";
      case "NetworkError":
        return "Unable to connect to Slack. Please try again later.";
      default:
        return "Something went wrong. Please try again or contact support if the problem persists.";
    }
  }

  return "Something went wrong. Please try again or contact support if the problem persists.";
}

/**
 * Checks if an error contains sensitive information
 */
export function containsSensitiveInfo(message: string): boolean {
  const sensitivePatterns = [
    /password/i,
    /token/i,
    /secret/i,
    /key/i,
    /credential/i,
    /authorization/i,
    /bearer/i,
    /api[_-]?key/i,
    /database.*connection/i,
    /connection.*string/i,
    /internal.*path/i,
    /file.*system/i,
    /stack.*trace/i,
  ];

  return sensitivePatterns.some((pattern) => pattern.test(message));
}

/**
 * Removes potentially sensitive information from error messages
 */
export function removeSensitiveInfo(message: string): string {
  let sanitized = message;

  // Remove file paths first (before stack trace removal)
  sanitized = sanitized.replace(/\/[^\s]+?\.(?:ts|js|json)(?=\s|$)/g, "[file]");

  // Remove connection strings
  sanitized = sanitized.replace(/postgresql:\/\/[^\s]+/g, "[database_url]");

  // Remove tokens and keys
  sanitized = sanitized.replace(/[a-zA-Z0-9]{20,}/g, "[redacted]");

  // Remove stack traces (do this last to preserve other content)
  sanitized = sanitized.replace(/\n\s*at\s+.*/g, "");

  return sanitized.trim();
}
