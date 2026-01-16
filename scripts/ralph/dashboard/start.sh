#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${1:-$(pwd)}"
PORT="${PORT:-7420}"

node "${SCRIPT_DIR}/server.js" --workdir "${WORK_DIR}" --port "${PORT}"
