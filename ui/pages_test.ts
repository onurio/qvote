import { getHomePage } from "./pages.ts";
import { assertEquals, assertMatch, assertStringIncludes } from "jsr:@std/assert";
import { stub } from "jsr:@std/testing/mock";

Deno.test("getHomePage loads static HTML file", async () => {
  // Create a fake HTML content
  const fakeHtml = "<html><body>Test Home Page</body></html>";

  // Stub Deno.readTextFile to return our fake HTML
  const readFileStub = stub(Deno, "readTextFile", () => Promise.resolve(fakeHtml));

  try {
    const html = await getHomePage();
    assertEquals(html, fakeHtml);
  } finally {
    readFileStub.restore();
  }
});

Deno.test("getHomePage falls back to default page on error", async () => {
  // Stub Deno.readTextFile to throw an error
  const readFileStub = stub(Deno, "readTextFile", () => {
    throw new Error("File not found");
  });

  // Create a stub for console.error to prevent test output pollution
  const consoleErrorStub = stub(console, "error");

  try {
    const html = await getHomePage();

    // Verify that the default content is returned
    assertStringIncludes(html, "QVote - Quadratic Voting for Slack");
    assertStringIncludes(html, "Make better group decisions with quadratic voting");
    assertStringIncludes(html, "Add to Slack");

    // Check the page structure
    assertMatch(html, /<!DOCTYPE html>/);
    assertStringIncludes(html, "<title>QVote - Quadratic Voting for Slack</title>");

    // Verify console.error was called with the expected error message
    assertEquals(consoleErrorStub.calls.length, 1);
    assertStringIncludes(
      consoleErrorStub.calls[0].args[0],
      "Failed to read home page template:",
    );
  } finally {
    readFileStub.restore();
    consoleErrorStub.restore();
  }
});
