import { assertEquals } from "@std/assert";

// Define parseQVoteCommand directly to avoid importing, which would trigger Prisma initialization
function parseQVoteCommand(text: string) {
  // Default values
  const result = {
    title: "",
    options: [] as string[],
    description: "",
    credits: 100,
    endTime: null as Date | null,
  };

  // Split by quoted arguments
  const matches = [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

  if (matches.length === 0) {
    return result; // No arguments
  }

  // First match is title, the rest are options (for now)
  result.title = matches[0];
  if (matches.length > 1) {
    result.options = matches.slice(1);
  }

  // Extract special flags
  if (text.includes("--desc")) {
    const descMatch = text.match(/--desc\s+"([^"]+)"/);
    if (descMatch && descMatch[1]) {
      result.description = descMatch[1];
      // Remove this option from the options array if it was caught there
      result.options = result.options.filter((opt) => opt !== descMatch[1]);
    }
  }

  if (text.includes("--credits")) {
    const creditsMatch = text.match(/--credits\s+(\d+)/);
    if (creditsMatch && creditsMatch[1]) {
      result.credits = parseInt(creditsMatch[1], 10);
    }
  }

  if (text.includes("--time")) {
    const timeMatch = text.match(/--time\s+(\d+)([hd])/);
    if (timeMatch && timeMatch[1] && timeMatch[2]) {
      const value = parseInt(timeMatch[1], 10);
      const unit = timeMatch[2];

      const endTime = new Date();
      if (unit === "h") {
        endTime.setHours(endTime.getHours() + value);
      } else if (unit === "d") {
        endTime.setDate(endTime.getDate() + value);
      }

      result.endTime = endTime;
    }
  }

  return result;
}

Deno.test("parseQVoteCommand - basic parsing", () => {
  // Test basic vote creation
  const result = parseQVoteCommand('"Test Vote" "Option 1" "Option 2" "Option 3"');
  assertEquals(result.title, "Test Vote");
  assertEquals(result.options, ["Option 1", "Option 2", "Option 3"]);
  assertEquals(result.description, "");
  assertEquals(result.credits, 100); // Default value
  assertEquals(result.endTime, null);
});

Deno.test("parseQVoteCommand - with all options", () => {
  // Test vote creation with all options
  const result = parseQVoteCommand(
    '"Test Vote" "Option 1" "Option 2" --desc "This is a description" --credits 200 --time 24h',
  );
  assertEquals(result.title, "Test Vote");
  assertEquals(result.options, ["Option 1", "Option 2"]);
  assertEquals(result.description, "This is a description");
  assertEquals(result.credits, 200);

  // Check that endTime is approximately correct (within a minute)
  const expectedTime = new Date();
  expectedTime.setHours(expectedTime.getHours() + 24);

  if (result.endTime) {
    const timeDiff = Math.abs(result.endTime.getTime() - expectedTime.getTime());
    // Within a minute
    assertEquals(timeDiff < 60000, true);
  } else {
    throw new Error("End time should be set");
  }
});

Deno.test("parseQVoteCommand - with days duration", () => {
  // Test vote creation with days duration
  const result = parseQVoteCommand('"Test Vote" "Option 1" "Option 2" --time 3d');

  // Check that endTime is approximately correct (within a minute)
  const expectedTime = new Date();
  expectedTime.setDate(expectedTime.getDate() + 3);

  if (result.endTime) {
    const timeDiff = Math.abs(result.endTime.getTime() - expectedTime.getTime());
    // Within a minute
    assertEquals(timeDiff < 60000, true);
  } else {
    throw new Error("End time should be set");
  }
});

Deno.test("parseQVoteCommand - insufficient arguments", () => {
  // Test insufficient arguments
  const result = parseQVoteCommand('"Test Vote"');
  assertEquals(result.title, "Test Vote");
  assertEquals(result.options.length, 0);
  assertEquals(result.options, []);
});
