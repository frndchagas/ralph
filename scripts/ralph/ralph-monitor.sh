#!/bin/bash

# Ralph Monitor - TUI dashboard for monitoring Ralph sessions
# Usage: ./ralph-monitor.sh [work_dir]
#
# If no work_dir is provided:
#   1. Uses current directory if tasks/prd.json exists
#   2. Otherwise searches for ralph worktrees

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

find_work_dir() {
    # If argument provided, use it
    if [[ -n "$1" ]]; then
        echo "$1"
        return
    fi

    # Check current directory
    if [[ -f "tasks/prd.json" ]]; then
        echo "$(pwd)"
        return
    fi

    # Look for ralph worktrees
    local worktrees=$(git worktree list 2>/dev/null | grep "ralph" | head -1 | awk '{print $1}')
    if [[ -n "$worktrees" ]] && [[ -f "$worktrees/tasks/prd.json" ]]; then
        echo "$worktrees"
        return
    fi

    # Default to current directory
    echo "$(pwd)"
}

WORK_DIR=$(find_work_dir "$1")

echo "Monitoring: $WORK_DIR"
exec bash "$SCRIPT_DIR/monitor/start.sh" "$WORK_DIR"
