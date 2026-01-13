#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MAX_ITERATIONS_ARG=${1:-"auto"}
FEATURE_NAME=${2:-"feature"}

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
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1" >&2; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1" >&2; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_ralph() { echo -e "${CYAN}[RALPH]${NC} $1" >&2; }

show_progress() {
    local prd_file="$1"
    local completed=$(jq '[.userStories[] | select(.passes == true)] | length' "$prd_file" 2>/dev/null || echo "0")
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
}

show_current_story() {
    local prd_file="$1"
    local current_id=$(jq -r '.userStories[] | select(.passes == false) | .id' "$prd_file" 2>/dev/null | head -1)

    if [[ -n "$current_id" ]]; then
        local current_title=$(jq -r ".userStories[] | select(.id == \"$current_id\") | .title" "$prd_file" 2>/dev/null)
        log_info "Current story: ${CYAN}${current_id}${NC} - ${current_title}"
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
            echo "  ${GREEN}${line}${NC}" >&2
        done
    fi

    local changes=$(git diff --stat HEAD~1..HEAD 2>/dev/null | tail -5 || echo "")
    if [[ -n "$changes" ]]; then
        log_info "Modified files:"
        echo "$changes" >&2
    fi

    if [[ -f "tasks/progress.txt" ]] && [[ -s "tasks/progress.txt" ]]; then
        log_info "Last documented progress:"
        echo -e "${GRAY}" >&2
        tail -15 tasks/progress.txt | head -15 >&2
        echo -e "${NC}" >&2
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
        git branch "$branch_name" "origin/$default_branch" 2>&1 >&2 || git branch "$branch_name" "$default_branch" 2>&1 >&2
    fi

    log_info "Creating worktree: $worktree_dir"
    git worktree add "$worktree_dir" "$branch_name" >&2

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

get_pending_stories() {
    local prd_file="$1"
    if [[ -f "$prd_file" ]]; then
        jq -r '.userStories[] | select(.passes == false) | .id + ": " + .title' "$prd_file" 2>/dev/null || echo ""
    fi
}

run_ralph_loop() {
    local work_dir="$1"
    local iteration=1
    local completed=false
    local previous_story=""

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

    log_ralph "Starting autonomous loop..."
    log_info "Max iterations: $MAX_ITERATIONS"
    log_info "Working directory: $work_dir"
    echo ""

    while [[ $iteration -le $MAX_ITERATIONS ]]; do
        echo ""
        log_ralph "═══════════════════════════════════════════════════════"
        log_ralph "ITERATION $iteration of $MAX_ITERATIONS"
        log_ralph "═══════════════════════════════════════════════════════"
        echo ""

        show_progress "tasks/prd.json"

        local current_story=$(jq -r '.userStories[] | select(.passes == false) | .id' tasks/prd.json 2>/dev/null | head -1)

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
        claude --dangerously-skip-permissions -p "$(cat "${SCRIPT_DIR}/prompt.md")" 2>&1 | tee "$temp_output" || true
        output=$(cat "$temp_output")
        rm -f "$temp_output"

        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        echo ""
        log_info "Iteration completed in ${duration}s"

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
        log_info "Total iterations: $((iteration))"

        echo ""
        log_info "Next steps:"
        echo "  1. Review changes: git log --oneline -10"
        echo "  2. Create PR: gh pr create"
        echo "  3. Or merge: git checkout main && git merge --no-ff"

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
    echo ""

    local work_dir
    work_dir=$(create_worktree)

    archive_previous_run "$work_dir"

    run_ralph_loop "$work_dir"
}

main "$@"
