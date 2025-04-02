// Global test setup and cleanup file for managing database connections
import { closeDatabase, prisma } from "@db/prisma.ts";

// This script can run in two ways:
// 1. As a standalone script to set up test environment
// 2. As an imported module in tests

// Track active Deno resources (sockets, files, etc.)
const resources = new Set<string>();

// Patch Prisma's connect and disconnect methods to track resources
const originalConnect = prisma.$connect.bind(prisma);
const originalDisconnect = prisma.$disconnect.bind(prisma);

// Monkey-patch Prisma methods to track resources
prisma.$connect = async function () {
  await originalConnect();

  // // After connecting, snapshot all current resources
  // for (const rid of Deno.().keys()) {
  //   resources.add(rid);
  // }

  // return result;
};

prisma.$disconnect = async function () {
  const result = await originalDisconnect();
  resources.clear();
  return result;
};

// Clean up function to ensure all resources are properly closed
export async function cleanup() {
  console.log("Cleaning up database connections...");

  try {
    // First try normal disconnect
    await closeDatabase();

    // Force release any Node.js file handles
    // This is needed to fix the "leak" error seen in tests
    // Wait a tick to allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    resources.clear();
    console.log("Cleanup complete");
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}

// Register signal handlers for proper cleanup
Deno.addSignalListener("SIGINT", async () => {
  await cleanup();
  Deno.exit(0);
});

Deno.addSignalListener("SIGTERM", async () => {
  await cleanup();
  Deno.exit(0);
});

// Global teardown that runs after all tests
Deno.test({
  name: "___DATABASE_CLEANUP___",
  fn: async () => {
    await cleanup();
  },
  sanitizeOps: false,
  sanitizeResources: false,
  sanitizeExit: false,
});

// If this module is run directly as a script
if (import.meta.main) {
  console.log("Setting up test environment...");

  // Register unhandledRejection handler
  globalThis.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection:", event);
  });

  // Add cleanup on process exit
  Deno.addSignalListener("SIGINT", cleanup);
}
