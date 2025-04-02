#!/bin/sh
# QVote git hooks installation script

echo "Installing QVote git hooks..."

# Copy pre-commit hook
cp "$(pwd)/hooks/pre-commit" "$(pwd)/.git/hooks/pre-commit"
chmod +x "$(pwd)/.git/hooks/pre-commit"

echo "✅ Git hooks installed successfully!"
echo "Pre-commit hook will enforce:"
echo "  - Code linting, formatting, and type checking"
echo "  - All tests passing"
echo "  - Line coverage and branch coverage checks"
exit 0