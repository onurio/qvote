# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Commands

```bash
# Development
deno task dev          # Start dev server with hot reload (--watch)
deno task start        # Start production server

# Testing
deno task test         # Run all tests (spins up test DB on port 5433 first)
deno task coverage     # Run tests with coverage report

# Code quality
deno task lint         # Lint TypeScript files
deno task fmt          # Format code (2-space indent, 100 char line, double quotes, semicolons)
deno task fmt:check    # Check formatting without writing
deno task check        # Type-check all TypeScript files
deno task check:all    # Run lint + fmt:check + check + coverage (used in pre-commit hook)

# Database
deno task prisma:generate   # Regenerate Prisma client (run after schema changes)
deno task prisma:migrate    # Create and apply new migration
deno task prisma:deploy     # Apply existing migrations to DB
deno task prisma:studio     # Open Prisma Studio GUI
deno task prisma:seed       # Seed database

# Run a single test file
deno task test:db:setup && LOG_LEVEL=ERROR DB_HOST=localhost DB_PORT=5433 DB_USER=test DB_PASSWORD=test DB_NAME=test DATABASE_URL=postgresql://test:test@localhost:5433/test ENCRYPTION_SECRET=test-encryption-secret-for-tests-32chars deno test --allow-read --allow-env --allow-net --allow-ffi --allow-run "path/to/file_test.ts"
```

Tests require a PostgreSQL instance on port **5433** (separate from dev DB). The `test:db:setup`
task handles this via `scripts/setup-test-db.sh`.

## Architecture

**QVote** is a Slack app for quadratic voting, built on Deno + Oak + Prisma + PostgreSQL.

### Request Flow

```
Slack → HMAC signature verification (middleware/slack-verification.ts)
     → Rate limiting (middleware/rate-limit.ts, in-memory only, not Redis)
     → Route handlers:
         POST /slack/commands    → workspace validation → routeSlackCommand()
         POST /slack/interactions → routeSlackInteraction() (block_actions / view_submission)
         POST /slack/events      → handleSlackEvent() (app_uninstalled, url_verification)
         GET  /oauth/authorize   → redirect to Slack OAuth
         GET  /oauth/callback    → exchange code, save workspace
```

### Module Structure

Path aliases are defined in `deno.json` imports:

| Alias          | Path            | Purpose                                                      |
| -------------- | --------------- | ------------------------------------------------------------ |
| `@db/`         | `./db/`         | `VotesService`, `WorkspaceService` singletons, Prisma client |
| `@slack/`      | `./slack/`      | Slack routes and all interaction/command handlers            |
| `@oauth/`      | `./oauth/`      | OAuth routes and auth service                                |
| `@middleware/` | `./middleware/` | Slack HMAC verification, rate limit, security headers        |
| `@utils/`      | `./utils/`      | Logger, encryption, HTTP client, error sanitization          |
| `@ui/`         | `./ui/`         | HTML pages (home, privacy policy, terms of service)          |

### Key Design Patterns

**Services**: `db/prisma.ts` exports singleton instances `votesService` (VotesService) and
`workspaceService` (WorkspaceService) backed by a shared PrismaClient. Import these everywhere
instead of instantiating new ones.

**Slack interaction routing**: `slack/services/interactions/router.ts` dispatches `block_actions` by
`action_id` and `view_submission` by `callback_id`. Add new action handlers by registering new
`action_id` cases there.

**Token encryption**: Slack access tokens are stored encrypted (AES-GCM, prefix `enc:v1:`) using
`ENCRYPTION_SECRET`. The singleton `tokenEncryption` in `utils/encryption.ts` handles
encrypt/decrypt transparently. Tokens without the prefix are treated as legacy unencrypted.

**Error responses**: Slack API requires HTTP 200 even on errors. Use `createErrorResponse()` from
`slack/services/interactions/vote-utils.ts` for interaction errors. Never return 4xx/5xx to Slack
endpoints.

### Database Schema

Three Prisma models: `Workspace` (Slack team + encrypted bot token) → `Vote` (quadratic vote with
JSON `options` and `allowedVoters`) → `VoteResponse` (per-user, per-option credit allocations,
unique on `[voteId, userId, optionIndex]`).

Prisma generates the client into `node_modules/generated/` (not the usual location). Import types
from `"generated/index.d.ts"`.

### Environment Variables

Copy `.env.example` to `.env`. Required:

- `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_REDIRECT_URI`
- `DATABASE_URL` (PostgreSQL)
- `ENCRYPTION_SECRET` (generate: `openssl rand -base64 32`)
- `USE_HTTPS`, `CERT_FILE`, `KEY_FILE` (for HTTPS mode; certs are in `certs/`)
