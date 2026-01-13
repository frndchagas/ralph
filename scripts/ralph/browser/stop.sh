#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${SCRIPT_DIR}/.browser.pid"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[BROWSER]${NC} $1"; }
log_success() { echo -e "${GREEN}[BROWSER]${NC} $1"; }
log_error() { echo -e "${RED}[BROWSER]${NC} $1"; }

if [[ ! -f "$PID_FILE" ]]; then
    log_info "Browser server not running (no PID file)"
    exit 0
fi

PID=$(cat "$PID_FILE")

if kill -0 "$PID" 2>/dev/null; then
    log_info "Stopping browser server (PID: $PID)..."
    kill "$PID" 2>/dev/null
    sleep 1

    if kill -0 "$PID" 2>/dev/null; then
        log_info "Force killing..."
        kill -9 "$PID" 2>/dev/null
    fi

    log_success "Browser server stopped"
else
    log_info "Browser server not running (stale PID)"
fi

rm -f "$PID_FILE"
