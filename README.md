# QVote - Quadratic Voting for Slack

A Slack app for creating quadratic votes in your workspace. Quadratic voting is a collective decision-making procedure where participants express how strongly they feel about different issues by spending "voice credits" to influence the outcome.

## Features

- Create quadratic votes directly in Slack
- Allow team members to allocate credits across options
- Visualize voting results and analytics
- Simple and intuitive user interface

## Setup

### Prerequisites

- [Deno](https://deno.land/) installed (version 1.38 or later)
- A Slack workspace where you can install apps

### Installation

1. Clone this repository
2. Copy `.env.example` to `.env` and fill in your Slack app credentials
3. Create a Slack app at https://api.slack.com/apps
   - Add the necessary OAuth scopes: `commands`, `chat:write`, `channels:read`
   - Set the redirect URL to your callback URL (e.g., `http://localhost:8080/oauth/callback`)

### Running the app

```bash
# Install dependencies and start the development server
deno task dev
```

The server will start at http://localhost:8080.

## Development

### Project Structure

- `/` - Main server and application entry point
- `/oauth/` - Slack OAuth integration
- `/models/` - Data models for votes and users (future)
- `/api/` - API endpoints for Slack interactions (future)

### How to Create a Slack App

1. Go to https://api.slack.com/apps and click "Create New App"
2. Choose "From scratch" and provide a name and workspace
3. Under "OAuth & Permissions":
   - Add the redirect URL: `http://localhost:8080/oauth/callback`
   - Add the required scopes: `commands`, `chat:write`, `channels:read`
4. Under "Slash Commands":
   - Create a new command `/qvote` (implementation forthcoming)
5. Install the app to your workspace
6. Copy the Client ID and Client Secret to your `.env` file

## License

MIT