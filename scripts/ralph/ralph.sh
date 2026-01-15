#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

MAX_ITERATIONS_ARG="auto"
FEATURE_NAME="feature"
USE_BROWSER=false
BROWSER_HEADLESS=true
USE_MULTI_AGENT=false
USE_WORKTREE=true
STALE_SECONDS="${STALE_SECONDS:-600}"  # 10 minutes default

while [[ $# -gt 0 ]]; do
    case $1 in
        --multi-agent)
            USE_MULTI_AGENT=true
            shift
            ;;
        --browser)
            USE_BROWSER=true
            shift
            ;;
        --browser-visible)
            USE_BROWSER=true
            BROWSER_HEADLESS=false
            shift
            ;;
        --no-worktree)
            USE_WORKTREE=false
            shift
            ;;
        -*)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
        *)
            if [[ "$MAX_ITERATIONS_ARG" == "auto" ]] && [[ -z "${FIRST_ARG_SET:-}" ]]; then
                MAX_ITERATIONS_ARG="$1"
                FIRST_ARG_SET=true
            else
                FEATURE_NAME="$1"
            fi
            shift
            ;;
    esac
done

calculate_iterations() {
    local prd_file="$1"
    local total_stories=$(jq '.userStories | length' "$prd_file" 2>/dev/null || echo "0")

    if [[ "$total_stories" -eq 0 ]]; then
        echo "20"
        return
    fi

    local calculated=$(( (total_stories * 130 + 99) / 100 ))
    if [[ "$calculated" -lt 20 ]]; then
        echo "20"
    else
        echo "$calculated"
    fi
}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1" >&2; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1" >&2; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_ralph() { echo -e "${CYAN}[RALPH]${NC} $1" >&2; }
log_browser() { echo -e "${MAGENTA}[BROWSER]${NC} $1" >&2; }

show_progress() {
    local prd_file="$1"
    # Support both status-based and legacy passes-based format
    local completed=$(jq '[.userStories[] | select(.status == "done" or (.status == null and .passes == true))] | length' "$prd_file" 2>/dev/null || echo "0")
    local in_progress=$(jq '[.userStories[] | select(.status == "in_progress")] | length' "$prd_file" 2>/dev/null || echo "0")
    local total=$(jq '.userStories | length' "$prd_file" 2>/dev/null || echo "0")

    if [[ "$total" -eq 0 ]]; then
        return
    fi

    local percent=$((completed * 100 / total))
    local filled=$((completed * 20 / total))
    local empty=$((20 - filled))

    local bar=""
    for ((i=0; i<filled; i++)); do bar+="█"; done
    for ((i=0; i<empty; i++)); do bar+="░"; done

    log_info "Progress: [${bar}] ${completed}/${total} (${percent}%)"
    if [[ "$in_progress" -gt 0 ]]; then
        log_info "In progress: ${YELLOW}${in_progress}${NC} story(ies)"
    fi
}

show_current_story() {
    local prd_file="$1"
    # Support both status-based and legacy passes-based format
    local current_id=$(jq -r '.userStories[] | select(.status == "in_progress") | .id' "$prd_file" 2>/dev/null | head -1)

    if [[ -z "$current_id" ]]; then
        current_id=$(jq -r '.userStories[] | select(.status == "open" or (.status == null and .passes == false)) | .id' "$prd_file" 2>/dev/null | head -1)
    fi

    if [[ -n "$current_id" ]]; then
        local current_title=$(jq -r ".userStories[] | select(.id == \"$current_id\") | .title" "$prd_file" 2>/dev/null)
        local current_status=$(jq -r ".userStories[] | select(.id == \"$current_id\") | .status // \"open\"" "$prd_file" 2>/dev/null)
        log_info "Current story: ${CYAN}${current_id}${NC} - ${current_title} [${YELLOW}${current_status}${NC}]"
    fi
}

show_iteration_summary() {
    local work_dir="$1"

    echo "" >&2
    log_ralph "ITERATION SUMMARY:"

    cd "$work_dir"

    local commits=$(git log --oneline -3 2>/dev/null || echo "")
    if [[ -n "$commits" ]]; then
        log_info "Recent commits:"
        echo "$commits" | while read -r line; do
            echo -e "  ${GREEN}${line}${NC}" >&2
        done
    fi

    local changes=$(git diff --stat HEAD~1..HEAD 2>/dev/null | tail -5 || echo "")
    if [[ -n "$changes" ]]; then
        log_info "Modified files:"
        echo "$changes" >&2
    fi

    if [[ -f "tasks/progress.txt" ]] && [[ -s "tasks/progress.txt" ]]; then
        log_info "Last learning:"
        local last_section=$(grep -n "^---$" tasks/progress.txt | tail -2 | head -1 | cut -d: -f1)
        if [[ -n "$last_section" ]]; then
            tail -n +$last_section tasks/progress.txt | head -12 | while read -r line; do
                echo -e "  ${GRAY}${line}${NC}" >&2
            done
        fi
    fi
}

check_stall() {
    local current_story="$1"
    local previous_story="$2"
    local work_dir="$3"

    if [[ -z "$previous_story" ]] || [[ "$current_story" != "$previous_story" ]]; then
        return 0
    fi

    cd "$work_dir"
    local changes=$(git diff --shortstat HEAD~1..HEAD 2>/dev/null || echo "")

    if [[ -z "$changes" ]]; then
        log_warning "POSSIBLE STALL: Same story ($current_story) with no changes detected"
        log_info "Consider manual intervention or check progress.txt"
        return 1
    fi

    return 0
}

check_stale_story() {
    local prd_file="$1"
    local current_time=$(date +%s)

    local in_progress_story=$(jq -r '.userStories[] | select(.status == "in_progress") | .id' "$prd_file" 2>/dev/null | head -1)

    if [[ -z "$in_progress_story" ]]; then
        return 0
    fi

    local started_at=$(jq -r ".userStories[] | select(.id == \"$in_progress_story\") | .startedAt // 0" "$prd_file" 2>/dev/null)

    if [[ "$started_at" == "0" ]] || [[ "$started_at" == "null" ]]; then
        return 0
    fi

    local elapsed=$((current_time - started_at))

    if [[ $elapsed -gt $STALE_SECONDS ]]; then
        log_warning "STALE STORY DETECTED: $in_progress_story has been in_progress for ${elapsed}s (limit: ${STALE_SECONDS}s)"
        return 1
    fi

    return 0
}

reset_stale_story() {
    local prd_file="$1"
    local story_id="$2"
    local work_dir="$3"

    log_warning "Resetting stale story: $story_id"

    cd "$work_dir"

    jq "(.userStories[] | select(.id == \"$story_id\")) |= . + {status: \"open\", startedAt: null, staleCount: ((.staleCount // 0) + 1)}" "$prd_file" > tmp.json && mv tmp.json "$prd_file"

    log_activity "$work_dir" "$story_id" "reset" "Story reset due to stale timeout (${STALE_SECONDS}s)"

    log_info "Story $story_id reset to 'open' status"
}

log_activity() {
    local work_dir="$1"
    local story_id="$2"
    local action="$3"
    local message="$4"
    local timestamp=$(date +"%Y-%m-%d %H:%M:%S")

    echo "[$timestamp] [$story_id] [$action] $message" >> "${work_dir}/tasks/activity.log"
}

show_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║   ██████╗  █████╗ ██╗     ██████╗ ██╗  ██╗                ║"
    echo "║   ██╔══██╗██╔══██╗██║     ██╔══██╗██║  ██║                ║"
    echo "║   ██████╔╝███████║██║     ██████╔╝███████║                ║"
    echo "║   ██╔══██╗██╔══██║██║     ██╔═══╝ ██╔══██║                ║"
    echo "║   ██║  ██║██║  ██║███████╗██║     ██║  ██║                ║"
    echo "║   ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝                ║"
    echo "║                                                           ║"
    echo "║   Autonomous AI Agent Loop for Claude Code CLI            ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_dependencies() {
    log_info "Checking dependencies..."

    if ! command -v claude &> /dev/null; then
        log_error "Claude Code CLI not found. Install at: https://claude.ai/code"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        log_error "jq not found. Install with: brew install jq"
        exit 1
    fi

    if ! command -v git &> /dev/null; then
        log_error "git not found."
        exit 1
    fi

    log_success "All dependencies found"
}

start_browser_server() {
    log_browser "Starting browser server..."
    export RALPH_BROWSER_HEADLESS="$BROWSER_HEADLESS"
    bash "${SCRIPT_DIR}/browser/start.sh"

    if [[ "$BROWSER_HEADLESS" == true ]]; then
        log_browser "Mode: headless"
    else
        log_browser "Mode: visible"
    fi
}

stop_browser_server() {
    if [[ "$USE_BROWSER" == true ]]; then
        log_browser "Stopping browser server..."
        bash "${SCRIPT_DIR}/browser/stop.sh"
    fi
}

create_worktree() {
    local slug=$(echo "$FEATURE_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')
    local branch_name="ralph/${slug}"
    local worktree_dir="${PROJECT_ROOT}/../$(basename "$PROJECT_ROOT")-ralph-${slug}"

    if [[ -d "$worktree_dir" ]]; then
        log_warning "Worktree already exists: $worktree_dir"
        log_info "Using existing worktree..."
        echo "$worktree_dir"
        return 0
    fi

    log_info "Creating branch: $branch_name"
    cd "$PROJECT_ROOT"

    git fetch origin main 2>/dev/null || git fetch origin master 2>/dev/null || true

    local default_branch="main"
    if ! git show-ref --verify --quiet "refs/remotes/origin/main"; then
        default_branch="master"
    fi

    if git show-ref --verify --quiet "refs/heads/$branch_name"; then
        log_info "Branch already exists, using existing"
    else
        git branch "$branch_name" "origin/$default_branch" >/dev/null 2>&1 || git branch "$branch_name" "$default_branch" >/dev/null 2>&1
    fi

    log_info "Creating worktree: $worktree_dir"
    git worktree add "$worktree_dir" "$branch_name" >/dev/null 2>&1

    log_info "Running worktree setup..."
    cd "$worktree_dir" || { log_error "Failed to cd into worktree"; exit 1; }

    if [[ -f ".claude/scripts/worktree-setup.sh" ]]; then
        bash .claude/scripts/worktree-setup.sh
    fi

    echo "$worktree_dir"
}

archive_previous_run() {
    local work_dir="$1"
    local archive_dir="${SCRIPT_DIR}/archive"
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local branch_name=$(cd "$work_dir" && git branch --show-current)
    local archive_path="${archive_dir}/${timestamp}-${branch_name//\//-}"

    if [[ -f "${work_dir}/tasks/prd.json" ]] || [[ -f "${work_dir}/tasks/progress.txt" ]]; then
        log_info "Archiving previous run to: $archive_path"
        mkdir -p "$archive_path"

        [[ -f "${work_dir}/tasks/prd.json" ]] && cp "${work_dir}/tasks/prd.json" "$archive_path/"
        [[ -f "${work_dir}/tasks/progress.txt" ]] && cp "${work_dir}/tasks/progress.txt" "$archive_path/"
    fi

    return 0
}

check_completion() {
    local output="$1"
    if echo "$output" | grep -q "<promise>COMPLETE</promise>"; then
        return 0
    fi
    return 1
}

check_rate_limit() {
    local output="$1"
    if echo "$output" | grep -qi "You've hit your limit\|rate limit\|resets.*at"; then
        return 0
    fi
    return 1
}

wait_for_rate_limit_reset() {
    local reset_info="$1"
    local count="${2:-1}"

    log_warning "Rate limit detected! (attempt $count)"

    local reset_time=$(echo "$reset_info" | grep -oE 'resets [^(]+' | head -1)
    if [[ -n "$reset_time" ]]; then
        log_info "Limit $reset_time"
    fi

    # Exponential backoff: 5min, 10min, 20min, 30min (max)
    local base_wait=300
    local wait_time=$((base_wait * count))
    if [[ $wait_time -gt 1800 ]]; then
        wait_time=1800
    fi
    local wait_minutes=$((wait_time / 60))

    echo ""
    log_info "Options:"
    echo "  1. Wait for rate limit reset"
    echo "  2. Press Ctrl+C to stop Ralph"
    echo ""
    log_info "Pausing for ${wait_minutes} minutes before retry (backoff level $count)..."
    log_info "Next retry at: $(date -v+${wait_minutes}M '+%H:%M:%S' 2>/dev/null || date -d "+${wait_minutes} minutes" '+%H:%M:%S' 2>/dev/null || echo "in ${wait_minutes} minutes")"

    sleep $wait_time
}

get_pending_stories() {
    local prd_file="$1"
    if [[ -f "$prd_file" ]]; then
        # Support both new status-based and legacy passes-based format
        jq -r '.userStories[] | select(.status == "open" or .status == "in_progress" or (.status == null and .passes == false)) | .id + ": " + .title' "$prd_file" 2>/dev/null || echo ""
    fi
}

build_prompt() {
    local base_prompt=$(cat "${SCRIPT_DIR}/prompt.md")
    local full_prompt="$base_prompt"

    if [[ "$USE_MULTI_AGENT" == true ]]; then
        local parallel_instructions=$(cat "${SCRIPT_DIR}/parallel-instructions.md" 2>/dev/null || echo "")
        if [[ -n "$parallel_instructions" ]]; then
            full_prompt="${full_prompt}\n\n${parallel_instructions}"
        fi
    fi

    if [[ "$USE_BROWSER" == true ]]; then
        local browser_instructions=$(cat "${SCRIPT_DIR}/browser-instructions.md" 2>/dev/null || echo "")
        if [[ -n "$browser_instructions" ]]; then
            full_prompt="${full_prompt}\n\n${browser_instructions}"
        fi
    fi

    echo -e "$full_prompt"
}

run_ralph_loop() {
    local work_dir="$1"
    local iteration=1
    local completed=false
    local previous_story=""
    local rate_limit_count=0
    local total_duration=0
    local iteration_count=0

    cd "$work_dir"

    if [[ ! -f "tasks/prd.json" ]]; then
        log_error "File tasks/prd.json not found!"
        log_info "Run /prd to create a PRD then /prd-to-json to convert"
        exit 1
    fi

    local MAX_ITERATIONS
    if [[ "$MAX_ITERATIONS_ARG" == "auto" ]]; then
        MAX_ITERATIONS=$(calculate_iterations "tasks/prd.json")
        local total_stories=$(jq '.userStories | length' tasks/prd.json 2>/dev/null || echo "0")
        log_info "Iterations calculated automatically: ${MAX_ITERATIONS} (${total_stories} stories + 30% margin)"
    else
        MAX_ITERATIONS="$MAX_ITERATIONS_ARG"
    fi

    mkdir -p tasks
    [[ ! -f "tasks/progress.txt" ]] && touch "tasks/progress.txt" || true
    [[ ! -f "tasks/guardrails.md" ]] && cp "${SCRIPT_DIR}/guardrails-template.md" "tasks/guardrails.md" || true
    [[ ! -f "tasks/activity.log" ]] && touch "tasks/activity.log" || true

    log_ralph "Starting autonomous loop..."
    log_info "Max iterations: $MAX_ITERATIONS"
    log_info "Working directory: $work_dir"
    if [[ "$USE_MULTI_AGENT" == true ]]; then
        log_info "Multi-agent: ${GREEN}enabled${NC} (parallel subagents)"
    fi
    if [[ "$USE_BROWSER" == true ]]; then
        log_info "Browser: ${GREEN}enabled${NC} (http://localhost:${RALPH_BROWSER_PORT:-9222})"
    fi
    echo ""

    local prompt=$(build_prompt)

    while [[ $iteration -le $MAX_ITERATIONS ]]; do
        echo ""
        log_ralph "═══════════════════════════════════════════════════════"
        log_ralph "ITERATION $iteration of $MAX_ITERATIONS"
        log_ralph "═══════════════════════════════════════════════════════"
        echo ""

        show_progress "tasks/prd.json"

        if ! check_stale_story "tasks/prd.json"; then
            local stale_story=$(jq -r '.userStories[] | select(.status == "in_progress") | .id' tasks/prd.json 2>/dev/null | head -1)
            if [[ -n "$stale_story" ]]; then
                reset_stale_story "tasks/prd.json" "$stale_story" "$work_dir"
            fi
        fi

        # Get current story (prefer status-based, fallback to passes-based for backward compatibility)
        local current_story=$(jq -r '.userStories[] | select(.status == "in_progress" or (.status == null and .passes == false)) | .id' tasks/prd.json 2>/dev/null | head -1)
        if [[ -z "$current_story" ]]; then
            current_story=$(jq -r '.userStories[] | select(.status == "open" or (.status == null and .passes == false)) | .id' tasks/prd.json 2>/dev/null | head -1)
        fi

        local pending=$(get_pending_stories "tasks/prd.json")
        if [[ -z "$pending" ]]; then
            log_success "All user stories completed!"
            completed=true
            break
        fi

        show_current_story "tasks/prd.json"
        echo ""

        local pending_count=$(echo "$pending" | wc -l | tr -d ' ')
        log_info "Pending stories: ${pending_count}"
        echo "$pending" | head -5 | while read -r story; do
            echo "  - $story"
        done
        if [[ "$pending_count" -gt 5 ]]; then
            echo "  ... and $((pending_count - 5)) more stories"
        fi
        echo ""

        log_info "Running Claude Code... ${GRAY}(real-time output)${NC}"
        local start_time=$(date +%s)

        local output
        local temp_output=$(mktemp)
        claude --dangerously-skip-permissions -p "$prompt" 2>&1 | tee "$temp_output" || true
        output=$(cat "$temp_output")
        rm -f "$temp_output"

        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        total_duration=$((total_duration + duration))
        iteration_count=$((iteration_count + 1))

        echo ""
        local duration_min=$((duration / 60))
        local duration_sec=$((duration % 60))
        log_info "Iteration completed in ${duration_min}m ${duration_sec}s"

        if [[ $iteration_count -gt 0 ]]; then
            local avg_duration=$((total_duration / iteration_count))
            local remaining_stories=$(jq '[.userStories[] | select(.status == "open" or .status == "in_progress" or (.status == null and .passes == false))] | length' tasks/prd.json 2>/dev/null || echo "0")
            if [[ $remaining_stories -gt 0 ]]; then
                local eta_seconds=$((avg_duration * remaining_stories))
                local eta_min=$((eta_seconds / 60))
                log_info "ETA: ~${eta_min}m (${remaining_stories} stories × ${avg_duration}s avg)"
            fi
        fi

        # Check for rate limit BEFORE processing output
        if check_rate_limit "$output"; then
            rate_limit_count=$((rate_limit_count + 1))
            wait_for_rate_limit_reset "$output" "$rate_limit_count"
            log_info "Retrying iteration $iteration after rate limit pause..."
            continue  # Retry same iteration, don't increment
        fi

        # Reset rate limit counter on successful iteration
        rate_limit_count=0

        show_iteration_summary "$work_dir"

        check_stall "$current_story" "$previous_story" "$work_dir" || true
        previous_story="$current_story"

        if check_completion "$output"; then
            log_success "Claude signaled COMPLETE!"
            completed=true
            break
        fi

        iteration=$((iteration + 1))

        if [[ $iteration -le $MAX_ITERATIONS ]]; then
            log_info "Waiting 3 seconds before next iteration..."
            sleep 3
        fi
    done

    echo ""
    log_ralph "═══════════════════════════════════════════════════════"

    if [[ "$completed" == true ]]; then
        log_success "Ralph completed all tasks!"
        local total_min=$((total_duration / 60))
        log_info "Total iterations: $iteration | Total time: ${total_min}m"

        echo ""
        log_info "Next steps:"
        echo "  1. Review changes: git log --oneline -10"
        echo "  2. Create PR: gh pr create"
        echo "  3. Or merge: git checkout main && git merge --no-ff"

        # macOS notification
        if command -v osascript &> /dev/null; then
            osascript -e 'display notification "All tasks completed!" with title "Ralph" sound name "Glass"' 2>/dev/null || true
        fi

        return 0
    else
        log_warning "Ralph reached iteration limit without completing all tasks"
        log_info "User stories still pending:"
        get_pending_stories "tasks/prd.json"

        echo ""
        log_info "Options:"
        echo "  1. Continue manually: claude"
        echo "  2. Run more iterations: $0 $((MAX_ITERATIONS + 10)) $FEATURE_NAME"

        return 1
    fi
}

cleanup() {
    stop_browser_server
}

trap cleanup EXIT

main() {
    show_banner
    check_dependencies

    echo ""
    log_info "Feature: $FEATURE_NAME"
    if [[ "$MAX_ITERATIONS_ARG" == "auto" ]]; then
        log_info "Max iterations: auto (calculated from PRD)"
    else
        log_info "Max iterations: $MAX_ITERATIONS_ARG"
    fi
    if [[ "$USE_MULTI_AGENT" == true ]]; then
        log_info "Multi-agent: enabled"
    fi
    if [[ "$USE_BROWSER" == true ]]; then
        log_info "Browser: enabled"
    fi
    if [[ "$USE_WORKTREE" == false ]]; then
        log_info "Worktree: disabled (running in current directory)"
    fi
    echo ""

    if [[ "$USE_BROWSER" == true ]]; then
        start_browser_server
        echo ""
    fi

    local work_dir
    if [[ "$USE_WORKTREE" == true ]]; then
        work_dir=$(create_worktree)
    else
        work_dir="$PROJECT_ROOT"
        log_info "Using current directory: $work_dir"
    fi

    archive_previous_run "$work_dir"

    run_ralph_loop "$work_dir"
}

main
