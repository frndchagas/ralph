#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
GRAY='\033[0;90m'
NC='\033[0m'

PRD_FILE="${1:-tasks/prd.json}"
SAVE_FILE=""

for arg in "$@"; do
    case $arg in
        --save)
            SAVE_FILE="tasks/overview.md"
            ;;
        --save=*)
            SAVE_FILE="${arg#*=}"
            ;;
    esac
done

if [[ ! -f "$PRD_FILE" ]]; then
    echo "Error: PRD file not found: $PRD_FILE" >&2
    exit 1
fi

format_timestamp() {
    local ts="$1"
    if [[ "$ts" == "null" ]] || [[ -z "$ts" ]] || [[ "$ts" == "0" ]]; then
        echo "-"
    else
        date -r "$ts" "+%Y-%m-%d %H:%M" 2>/dev/null || date -d "@$ts" "+%Y-%m-%d %H:%M" 2>/dev/null || echo "-"
    fi
}

title=$(jq -r '.title // "Untitled Feature"' "$PRD_FILE")
description=$(jq -r '.description // "No description"' "$PRD_FILE")

total=$(jq '.userStories | length' "$PRD_FILE")
done_count=$(jq '[.userStories[] | select(.status == "done" or (.status == null and .passes == true))] | length' "$PRD_FILE")
in_progress=$(jq '[.userStories[] | select(.status == "in_progress")] | length' "$PRD_FILE")
open_count=$(jq '[.userStories[] | select(.status == "open" or (.status == null and .passes == false))] | length' "$PRD_FILE")

if [[ "$total" -gt 0 ]]; then
    percent=$((done_count * 100 / total))
else
    percent=0
fi

output=""
output+="# Feature: ${title}\n\n"
output+="> ${description}\n\n"
output+="## Progress\n\n"
output+="- **Total Stories:** ${total}\n"
output+="- **Completed:** ${done_count} (${percent}%)\n"
output+="- **In Progress:** ${in_progress}\n"
output+="- **Open:** ${open_count}\n\n"
output+="## User Stories\n\n"
output+="| Status | ID | Title | Started | Completed |\n"
output+="|--------|-----|-------|---------|----------|\n"

while IFS= read -r story; do
    id=$(echo "$story" | jq -r '.id')
    story_title=$(echo "$story" | jq -r '.title')
    status=$(echo "$story" | jq -r '.status // (if .passes == true then "done" else "open" end)')
    started=$(echo "$story" | jq -r '.startedAt // 0')
    completed=$(echo "$story" | jq -r '.completedAt // 0')
    stale_count=$(echo "$story" | jq -r '.staleCount // 0')

    case "$status" in
        "done")
            icon="✅"
            ;;
        "in_progress")
            icon="🔄"
            ;;
        *)
            if [[ "$stale_count" -gt 0 ]]; then
                icon="🔁"
            else
                icon="⬜"
            fi
            ;;
    esac

    started_fmt=$(format_timestamp "$started")
    completed_fmt=$(format_timestamp "$completed")

    output+="| ${icon} | ${id} | ${story_title} | ${started_fmt} | ${completed_fmt} |\n"
done < <(jq -c '.userStories[]' "$PRD_FILE")

output+="\n### Legend\n"
output+="- ✅ Done\n"
output+="- 🔄 In Progress\n"
output+="- ⬜ Open\n"
output+="- 🔁 Reset (was stale)\n"

if [[ -f "tasks/activity.log" ]]; then
    output+="\n## Recent Activity\n\n"
    output+="\`\`\`\n"
    output+=$(tail -10 tasks/activity.log 2>/dev/null || echo "No activity yet")
    output+="\n\`\`\`\n"
fi

if [[ -f "tasks/guardrails.md" ]]; then
    guardrails_preview=$(head -20 tasks/guardrails.md 2>/dev/null | tail -15 || echo "")
    if [[ -n "$guardrails_preview" ]]; then
        output+="\n## Guardrails (Preview)\n\n"
        output+="${guardrails_preview}\n"
        output+="\n*See tasks/guardrails.md for full content*\n"
    fi
fi

output+="\n---\n*Generated: $(date '+%Y-%m-%d %H:%M:%S')*\n"

if [[ -n "$SAVE_FILE" ]]; then
    echo -e "$output" > "$SAVE_FILE"
    echo "Overview saved to: $SAVE_FILE" >&2
else
    echo -e "$output"
fi
