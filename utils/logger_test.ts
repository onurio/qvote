import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { spy } from "jsr:@std/testing/mock";
import { logger } from "./logger.ts";

// Helper function to create a spy on console methods
function setupConsoleSpy() {
  const consoleLogSpy = spy(console, "log");
  const consoleWarnSpy = spy(console, "warn");
  const consoleErrorSpy = spy(console, "error");

  return {
    logSpy: consoleLogSpy,
    warnSpy: consoleWarnSpy,
    errorSpy: consoleErrorSpy,
    // Helper to restore all spies
    restore: () => {
      consoleLogSpy.restore();
      consoleWarnSpy.restore();
      consoleErrorSpy.restore();
    },
  };
}

Deno.test("logger.debug logs with DEBUG level", () => {
  const consoleSpy = setupConsoleSpy();

  try {
    // Test with a simple string message
    logger.debug("Test debug message");

    // Verify that console.log was called
    assertEquals(consoleSpy.logSpy.calls.length, 1);

    // Check that the message contains expected elements
    const logMessage = consoleSpy.logSpy.calls[0].args[0];
    assertStringIncludes(logMessage, "[DEBUG]");
    assertStringIncludes(logMessage, "Test debug message");

    // Verify the ISO timestamp format
    assertStringIncludes(logMessage, new Date().toISOString().substring(0, 4));
  } finally {
    consoleSpy.restore();
  }
});

Deno.test("logger.info logs with INFO level", () => {
  const consoleSpy = setupConsoleSpy();

  try {
    // Test with a simple string message
    logger.info("Test info message");

    // Verify that console.log was called
    assertEquals(consoleSpy.logSpy.calls.length, 1);

    // Check that the message contains expected elements
    const logMessage = consoleSpy.logSpy.calls[0].args[0];
    assertStringIncludes(logMessage, "[INFO]");
    assertStringIncludes(logMessage, "Test info message");
  } finally {
    consoleSpy.restore();
  }
});

Deno.test("logger.warn logs with WARN level", () => {
  const consoleSpy = setupConsoleSpy();

  try {
    // Test with a simple string message
    logger.warn("Test warning message");

    // Verify that console.warn was called
    assertEquals(consoleSpy.warnSpy.calls.length, 1);

    // Check that the message contains expected elements
    const logMessage = consoleSpy.warnSpy.calls[0].args[0];
    assertStringIncludes(logMessage, "[WARN]");
    assertStringIncludes(logMessage, "Test warning message");
  } finally {
    consoleSpy.restore();
  }
});

Deno.test("logger.error logs with ERROR level", () => {
  const consoleSpy = setupConsoleSpy();

  try {
    // Test with a simple string message
    logger.error("Test error message");

    // Verify that console.error was called
    assertEquals(consoleSpy.errorSpy.calls.length, 1);

    // Check that the message contains expected elements
    const logMessage = consoleSpy.errorSpy.calls[0].args[0];
    assertStringIncludes(logMessage, "[ERROR]");
    assertStringIncludes(logMessage, "Test error message");
  } finally {
    consoleSpy.restore();
  }
});

Deno.test("logger handles additional data objects", () => {
  const consoleSpy = setupConsoleSpy();

  try {
    const testData = { userId: "123", action: "login", status: "success" };

    // Log with data object
    logger.info("User action", testData);

    // Verify call
    assertEquals(consoleSpy.logSpy.calls.length, 1);

    // Verify data was included in the log
    const logMessage = consoleSpy.logSpy.calls[0].args[0];
    assertStringIncludes(logMessage, "User action");
    assertStringIncludes(logMessage, '"userId": "123"');
    assertStringIncludes(logMessage, '"action": "login"');
    assertStringIncludes(logMessage, '"status": "success"');
  } finally {
    consoleSpy.restore();
  }
});

Deno.test("logger handles non-object data parameters", () => {
  const consoleSpy = setupConsoleSpy();

  try {
    // Test with various non-object values
    logger.info("Number value", 42);
    logger.info("String value", "test string");
    logger.info("Boolean value", true);

    // Verify all calls
    assertEquals(consoleSpy.logSpy.calls.length, 3);

    // Verify data was properly converted to string
    assertStringIncludes(consoleSpy.logSpy.calls[0].args[0], "Number value 42");
    assertStringIncludes(consoleSpy.logSpy.calls[1].args[0], "String value test string");
    assertStringIncludes(consoleSpy.logSpy.calls[2].args[0], "Boolean value true");
  } finally {
    consoleSpy.restore();
  }
});

Deno.test("logger handles data that can't be serialized", () => {
  const consoleSpy = setupConsoleSpy();

  try {
    // Create a circular reference that can't be serialized
    const circularObj: Record<string, unknown> = { name: "circular" };
    circularObj.self = circularObj;

    // This would normally throw when trying to JSON.stringify
    logger.info("Circular object", circularObj);

    // Verify the call happened
    assertEquals(consoleSpy.logSpy.calls.length, 1);

    // Should contain the error message for serialization
    assertStringIncludes(
      consoleSpy.logSpy.calls[0].args[0],
      "[Error serializing log data]",
    );
  } finally {
    consoleSpy.restore();
  }
});
