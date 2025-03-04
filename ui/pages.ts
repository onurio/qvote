/**
 * Utilities for loading and serving UI components
 */

/**
 * Loads the home page HTML content
 * @returns Promise with the HTML content of the home page
 */
export async function getHomePage(): Promise<string> {
  try {
    return await Deno.readTextFile("./static/home.html");
  } catch (error) {
    console.error("Failed to read home page template:", error);
    return getDefaultHomePage();
  }
}

/**
 * Returns the default home page HTML as a fallback
 * @returns Default home page HTML string
 */
function getDefaultHomePage(): string {
  return `<!DOCTYPE html>
    <html>
      <head>
        <title>QVote - Quadratic Voting for Slack</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
          }
          .button {
            display: inline-block;
            background-color: #4A154B;
            color: white;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 4px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <h1>QVote - Quadratic Voting for Slack</h1>
        <p>Make better group decisions with quadratic voting in your Slack workspace.</p>
        <p>
          <a href="/oauth/authorize" class="button">Add to Slack</a>
        </p>
      </body>
    </html>
  `;
}
