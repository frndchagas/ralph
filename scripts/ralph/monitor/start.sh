#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${1:-$(pwd)}"

cd "$SCRIPT_DIR"

if [[ ! -d "node_modules" ]]; then
    echo "Installing dependencies..."
    bun install
fi

exec bun run src/index.tsx "$WORK_DIR"
