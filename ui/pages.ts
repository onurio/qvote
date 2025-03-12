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
            color: #333;
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
          .features {
            margin-top: 2rem;
            margin-bottom: 2rem;
          }
          .code {
            background-color: #f5f5f5;
            padding: 0.5rem;
            border-radius: 4px;
            font-family: monospace;
          }
          .section {
            margin-top: 2rem;
          }
        </style>
      </head>
      <body>
        <h1>QVote - Quadratic Voting for Slack</h1>
        <p>Make better group decisions with quadratic voting in your Slack workspace.</p>
        
        <div class="features">
          <h2>Features:</h2>
          <ul>
            <li>Create votes directly from Slack</li>
            <li>Distribute voting credits among options</li>
            <li>View real-time results</li>
            <li>Get smarter outcomes with quadratic voting</li>
          </ul>
        </div>
        
        <p>
          <a href="/oauth/authorize" class="button">Add to Slack</a>
        </p>
        
        <div class="section">
          <h2>How to use:</h2>
          <p>Once installed, you can create a new vote with the <span class="code">/qvote</span> command:</p>
          
          <p class="code">/qvote "Title of your vote" "Option 1" "Option 2" "Option 3" --desc "Optional description" --credits 100 --time 24h</p>
          
          <p>Options:</p>
          <ul>
            <li><strong>Title and options:</strong> Must be in quotes</li>
            <li><strong>--desc:</strong> Optional description (in quotes)</li>
            <li><strong>--credits:</strong> Optional credits per user (default: 100)</li>
            <li><strong>--time:</strong> Optional duration (e.g., 24h, 7d)</li>
          </ul>
        </div>
        
        <div class="section">
          <h2>About Quadratic Voting</h2>
          <p>Quadratic voting allows participants to express not just which options they prefer, but how strongly they feel about each one. By allocating voting credits across options, users can better express their preferences.</p>
        </div>
      </body>
    </html>
  `;
}
