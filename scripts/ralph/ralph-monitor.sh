#!/bin/bash

# Ralph Monitor - TUI dashboard for monitoring Ralph sessions
# Usage: ./ralph-monitor.sh [work_dir]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/monitor/start.sh" "$@"
