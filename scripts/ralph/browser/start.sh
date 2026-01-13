#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${SCRIPT_DIR}/.browser.pid"

export RALPH_BROWSER_PORT="${RALPH_BROWSER_PORT:-9222}"
export RALPH_BROWSER_HEADLESS="${RALPH_BROWSER_HEADLESS:-true}"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[BROWSER]${NC} $1"; }
log_success() { echo -e "${GREEN}[BROWSER]${NC} $1"; }
log_error() { echo -e "${RED}[BROWSER]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[BROWSER]${NC} $1"; }

install_bun() {
    log_warning "Bun not found. Installing automatically..."

    if curl -fsSL https://bun.sh/install | bash > /dev/null 2>&1; then
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"

        if command -v bun &> /dev/null; then
            log_success "Bun installed successfully! ($(bun --version))"
            return 0
        fi
    fi

    log_error "Failed to install Bun automatically"
    log_info "Try manually: curl -fsSL https://bun.sh/install | bash"
    exit 1
}

if ! command -v bun &> /dev/null; then
    if [[ -f "$HOME/.bun/bin/bun" ]]; then
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"
    else
        install_bun
    fi
fi

if [[ -f "$PID_FILE" ]]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        log_info "Browser server already running (PID: $OLD_PID)"
        exit 0
    else
        rm -f "$PID_FILE"
    fi
fi

cd "$SCRIPT_DIR"

if [[ ! -d "node_modules" ]]; then
    log_info "Installing dependencies..."
    bun install --silent

    log_info "Installing Chromium..."
    bunx playwright install chromium
fi

log_info "Starting browser server on port $RALPH_BROWSER_PORT..."

nohup bun run src/server.ts > "${SCRIPT_DIR}/.browser.log" 2>&1 &
echo $! > "$PID_FILE"

sleep 2

if curl -s "http://localhost:${RALPH_BROWSER_PORT}/health" > /dev/null 2>&1; then
    log_success "Browser server started (PID: $(cat "$PID_FILE"))"
else
    log_error "Failed to start browser server. Check ${SCRIPT_DIR}/.browser.log"
    cat "${SCRIPT_DIR}/.browser.log" | tail -20
    rm -f "$PID_FILE"
    exit 1
fi
