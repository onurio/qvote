# QVote - Quadratic Voting for Slack

A Slack app for creating quadratic votes in your workspace. Quadratic voting is a collective
decision-making procedure where participants express how strongly they feel about different issues
by spending "voice credits" to influence the outcome.

## Features

- Create quadratic votes directly in Slack
- Allow team members to allocate credits across options
- Visualize voting results and analytics
- Simple and intuitive user interface

## Setup

### Prerequisites

- [Deno](https://deno.land/) installed (version 1.38 or later)
- [PostgreSQL](https://www.postgresql.org/) installed and running
- A Slack workspace where you can install apps

### Installation

1. Clone this repository
2. Copy `.env.example` to `.env` and fill in your Slack app credentials and database details
3. Create a Slack app at https://api.slack.com/apps
   - Add the necessary OAuth scopes: `commands`, `chat:write`, `channels:read`
   - Set the redirect URL to your callback URL (e.g., `http://localhost:8080/oauth/callback`)

### Database Setup

#### Local Development

```bash
# Create the database
deno task setup-db

# Run database migrations
deno task migrate
```

### Running the app

#### Using Deno directly

```bash
# Start the development server
deno task dev
```

#### Using Docker Compose

For production:

```bash
# Start the application and database with Docker
docker compose up -d

# View logs
docker compose logs -f
```

For development (with hot reload and volume mounting):

```bash
# Start with development config
docker compose -f docker-compose.dev.yml up -d

# View logs
docker compose -f docker-compose.dev.yml logs -f
```

The server will start at http://localhost:8080.

## Development

### Project Structure

- `/` - Main server and application entry point
- `/oauth/` - Slack OAuth integration
- `/db/` - Database connection and models
- `/api/` - API endpoints for Slack interactions (future)
- `Dockerfile` - Docker configuration for the application
- `docker-compose.yml` - Production Docker Compose configuration
- `docker-compose.dev.yml` - Development Docker Compose configuration with hot reload

### Database Schema

The application uses PostgreSQL with the following tables:

1. `workspaces` - Stores Slack workspace information and OAuth tokens
2. `votes` - Stores information about quadratic votes
3. `vote_responses` - Stores user responses to votes

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
