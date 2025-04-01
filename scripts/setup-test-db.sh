#!/bin/bash
set -e

# Script to setup test database for CI environment

echo "Setting up test database..."

# Start test database container
docker compose -f docker-compose.dev.yml up -d test-db

# Wait for database to be ready
echo "Waiting for test database to be ready..."
sleep 5

# Run database migrations
echo "Running database migrations..."
DB_HOST=localhost DB_PORT=5433 DB_USER=test DB_PASSWORD=test DB_NAME=test DATABASE_URL=postgresql://test:test@localhost:5433/test deno task prisma:push

echo "Test database setup complete!"