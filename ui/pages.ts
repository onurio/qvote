/**
 * Utilities for loading and serving UI components
 */

/**
 * Get the support email from environment variable or fallback to default
 * @returns The support email address
 */
export function getSupportEmail(): string {
  return Deno.env.get("SUPPORT_EMAIL") || "omrinuri@gmail.com";
}

/**
 * Loads the home page HTML content
 * @returns Promise with the HTML content of the home page
 */
export async function getHomePage(): Promise<string> {
  try {
    let html = await Deno.readTextFile("./static/home.html");
    // Replace support email placeholder
    html = html.replace(/support@example\.com/g, getSupportEmail());
    return html;
  } catch (error) {
    console.error("Failed to read home page template:", error);
    return getDefaultHomePage();
  }
}

/**
 * Loads the privacy policy page HTML content
 * @returns Promise with the HTML content of the privacy policy page
 */
export async function getPrivacyPolicyPage(): Promise<string> {
  try {
    let html = await Deno.readTextFile("./static/privacy-policy.html");
    // Replace support email placeholder
    html = html.replace(/support@example\.com/g, getSupportEmail());
    return html;
  } catch (error) {
    console.error("Failed to read privacy policy template:", error);
    return getDefaultPrivacyPolicyPage();
  }
}

/**
 * Loads the terms of service page HTML content
 * @returns Promise with the HTML content of the terms of service page
 */
export async function getTermsOfServicePage(): Promise<string> {
  try {
    let html = await Deno.readTextFile("./static/terms-of-service.html");
    // Replace support email placeholder
    html = html.replace(/support@example\.com/g, getSupportEmail());
    return html;
  } catch (error) {
    console.error("Failed to read terms of service template:", error);
    return getDefaultTermsOfServicePage();
  }
}

/**
 * Returns the default home page HTML as a fallback
 * @returns Default home page HTML string
 */
function getDefaultHomePage(): string {
  const supportEmail = getSupportEmail();
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
          .footer {
            margin-top: 3rem;
            padding-top: 1.5rem;
            border-top: 1px solid #eee;
            font-size: 0.9rem;
            color: #666;
          }
          .footer-links {
            display: flex;
            gap: 1.5rem;
            margin-bottom: 1rem;
          }
          .footer-links a {
            color: #555;
            text-decoration: none;
          }
          .footer-links a:hover {
            text-decoration: underline;
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
        
        <footer class="footer">
          <div class="footer-links">
            <a href="/privacy-policy" id="privacy-policy">Privacy Policy</a>
            <a href="mailto:${supportEmail}" id="support">Support</a>
          </div>
          <div>
            &copy; 2025 QVote. All rights reserved.
          </div>
        </footer>
      </body>
    </html>
  `;
}

/**
 * Returns the default privacy policy HTML as a fallback
 * @returns Default privacy policy HTML string
 */
function getDefaultPrivacyPolicyPage(): string {
  const supportEmail = getSupportEmail();
  return `<!DOCTYPE html>
    <html>
      <head>
        <title>Privacy Policy - QV</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
            color: #333;
          }
          h1 {
            color: #4A154B;
            border-bottom: 1px solid #eee;
            padding-bottom: 1rem;
          }
          .footer {
            margin-top: 3rem;
            padding-top: 1.5rem;
            border-top: 1px solid #eee;
            font-size: 0.9rem;
            color: #666;
          }
          a {
            color: #4A154B;
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
          .button.secondary {
            background-color: #f5f5f5;
            color: #333;
          }
        </style>
      </head>
      <body>
        <h1>Privacy Policy</h1>
        <p>Last updated: May 1, 2025</p>
        
        <p>This Privacy Policy describes how QV collects, uses, and discloses your information when you use my service.</p>
        <p>I collect minimal information necessary to provide the service, including workspace IDs, user IDs, and voting data.</p>
        <p>I do not sell your personal information.</p>
        <p>If you have any questions about this Privacy Policy, please contact me at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
        
        <div class="footer">
          <p>
            <a href="/" class="button secondary">Back to Home</a>
            <a href="/terms-of-service" class="button secondary">Terms of Service</a>
          </p>
          <p>&copy; 2025 QV. All rights reserved.</p>
        </div>
      </body>
    </html>
  `;
}

/**
 * Returns the default terms of service HTML as a fallback
 * @returns Default terms of service HTML string
 */
function getDefaultTermsOfServicePage(): string {
  const supportEmail = getSupportEmail();
  return `<!DOCTYPE html>
    <html>
      <head>
        <title>Terms of Service - QV</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
            color: #333;
          }
          h1 {
            color: #4A154B;
            border-bottom: 1px solid #eee;
            padding-bottom: 1rem;
          }
          h2 {
            margin-top: 2rem;
            color: #4A154B;
          }
          .section {
            margin-top: 2rem;
          }
          .footer {
            margin-top: 3rem;
            padding-top: 1.5rem;
            border-top: 1px solid #eee;
            font-size: 0.9rem;
            color: #666;
          }
          a {
            color: #4A154B;
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
          .button.secondary {
            background-color: #f5f5f5;
            color: #333;
          }
          pre {
            background-color: #f5f5f5;
            padding: 1rem;
            border-radius: 4px;
            overflow-x: auto;
          }
        </style>
      </head>
      <body>
        <h1>Terms of Service</h1>
        <p>Last updated: May 1, 2025</p>

        <div class="section">
          <p>Welcome to QV! These Terms of Service govern your use of the QV application.</p>
        </div>

        <div class="section">
          <h2>Open Source License</h2>
          <p>
            QV is open source software released under the MIT License. The Service is provided "as is", 
            without warranty of any kind, express or implied.
          </p>
        </div>

        <div class="section">
          <h2>Limitation of Liability</h2>
          <p>
            In no event shall I be liable for any claim, damages, or other liability, whether in an 
            action of contract, tort or otherwise, arising from, out of, or in connection with the 
            Service or the use or other dealings in the Service.
          </p>
        </div>

        <div class="section">
          <h2>Contact</h2>
          <p>
            If you have any questions about these Terms, please contact <a href="mailto:${supportEmail}">${supportEmail}</a>.
          </p>
        </div>

        <div class="footer">
          <p>
            <a href="/" class="button secondary">Back to Home</a>
            <a href="/privacy-policy" class="button secondary">Privacy Policy</a>
          </p>
          <p>&copy; 2025 QV. All rights reserved.</p>
        </div>
      </body>
    </html>
  `;
}
