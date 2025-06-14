# QVote - Quadratic Voting for Slack

A Slack app for creating quadratic votes in your workspace. Quadratic voting is a collective
decision-making procedure where participants express how strongly they feel about different issues
by spending "voice credits" to influence the outcome.

**Live App:** [qvote.omrinuri.com](https://qvote.omrinuri.com)

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
   - Set `ENCRYPTION_SECRET` to a strong random string (e.g., generate with
     `openssl rand -base64 32`)
3. Create a Slack app at https://api.slack.com/apps
   - Add the necessary OAuth scopes: `commands`, `chat:write`, `channels:join`
   - Set the redirect URL to your callback URL (e.g., `http://localhost:8080/oauth/callback`)

### Database Setup

#### Local Development

```bash
# Create the database
deno task setup-db

# Generate Prisma client
deno task prisma:generate

# Create and apply migrations
deno task prisma:dev

# Optional: Seed the database with initial data
deno task prisma:seed

# Optional: View database with Prisma Studio
deno task prisma:studio

# Encrypt existing tokens (if upgrading from unencrypted version)
deno run --allow-env --allow-read --allow-write scripts/migrate-encrypt-tokens.ts
```

#### Migration Commands

- `deno task prisma:dev` - Create a new migration and apply it
- `deno task prisma:deploy` - Apply existing migrations to the database
- `deno task prisma:status` - Check the status of migrations
- `deno task prisma:reset` - Reset the database and apply all migrations

### Running the app

#### Using Deno directly

```bash
# Start the development server
deno task dev
```

### Install Git Hooks

The project includes git hooks for code quality and coverage enforcement. To install:

```bash
# Make the install script executable
chmod +x hooks/install-hooks.sh

# Run the installation script
./hooks/install-hooks.sh
```

This will install a pre-commit hook that enforces:

- Code linting and formatting standards
- Type checking
- Test success
- Minimum test coverage thresholds:
  - Line coverage: 80%
  - Branch coverage: 80%

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

The server will start at http://localhost:8443.

### Database Schema

The application uses PostgreSQL with Prisma ORM. The schema is defined in `prisma/schema.prisma`:

1. `Workspace` - Stores Slack workspace information and OAuth tokens
2. `Vote` - Stores information about quadratic votes
3. `VoteResponse` - Stores user responses to votes

## License

MIT License - Copyright (c) 2025 - All rights reserved
