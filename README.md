# Ralph

> Autonomous AI Agent Loop for **Claude Code CLI**

Ralph enables [Claude Code CLI](https://claude.ai/code) to autonomously complete entire features by iterating through a PRD. Each iteration, Claude works on one user story, commits changes, documents learnings, and continues until done.

## Features

**Core**
- Autonomous loop with persistent memory (`progress.txt`, `guardrails.md`)
- PRD-driven task management with granular status (`open` → `in_progress` → `done`)
- Git worktrees for isolated development
- Rate limit detection with exponential backoff
- Learning consolidation into `CLAUDE.md`/`AGENTS.md` at completion

**Optional**
- `--multi-agent`: Parallel subagents for faster exploration
- `--browser`: Playwright-based UI testing with multi-context support

## Quick Start

```bash
# 1. Install Ralph
git clone https://github.com/frndchagas/ralph.git /tmp/ralph && \
  mkdir -p .claude scripts && \
  cp -r /tmp/ralph/.claude/commands .claude/ && \
  cp -r /tmp/ralph/scripts/ralph scripts/ && \
  rm -rf /tmp/ralph

# 2. Create PRD (inside Claude Code)
/prd
/prd-to-json tasks/prd-my-feature.md

# 3. Run
./scripts/ralph/ralph.sh auto "my-feature"
```

**Dependencies:** [Claude Code CLI](https://claude.ai/code), [jq](https://stedolan.github.io/jq/), Git, [Bun](https://bun.sh) (browser mode only)

## CLI Usage

```bash
./scripts/ralph/ralph.sh [iterations] [feature] [options]
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| iterations | auto | Max iterations (auto = stories + 30%, minimum 20) |
| feature | "feature" | Name for worktree/branch |
| --multi-agent | off | Enable parallel subagents |
| --browser | off | Headless browser |
| --browser-visible | off | Visible browser |
| --no-worktree | off | Use current directory |

**Examples:**
```bash
./scripts/ralph/ralph.sh auto "user-auth"              # Basic
./scripts/ralph/ralph.sh auto "feature" --multi-agent  # Faster exploration
./scripts/ralph/ralph.sh auto "e2e" --browser          # With UI testing
./scripts/ralph/ralph.sh auto "fix" --no-worktree      # Resume existing
```

## Workflow

```
┌─────────────────────────────────────────────┐
│  1. Create worktree → 2. Read PRD + memory  │
│  3. Claude implements one story             │
│  4. Commit + update status + document       │
│  5. Repeat until COMPLETE                   │
└─────────────────────────────────────────────┘
```

## Project Structure

```
your-project/
├── .claude/commands/     # /prd, /prd-to-json, /ralph, /overview
├── scripts/ralph/        # ralph.sh, prompt.md, browser/
└── tasks/
    ├── prd.json          # Stories with status
    ├── progress.txt      # Iteration learnings
    ├── guardrails.md     # Rules Claude MUST follow
    └── activity.log      # Status transitions
```

## Commands

| Command | Description |
|---------|-------------|
| `/prd` | Generate structured PRD |
| `/prd-to-json` | Convert PRD to JSON |
| `/overview` | Summary of progress |
| `/frontend-design` | High-quality UI generation |

## Multi-Agent Mode

Spawns specialized subagents via Claude's Task tool:

| Agent | Purpose |
|-------|---------|
| Explore | Fast codebase search |
| Plan | Architecture strategy |
| code-reviewer | Bugs, security, quality |
| test-runner | Run test suites |

Use for complex features, large codebases, or tasks requiring parallel exploration.

## Browser Mode

Playwright server on `localhost:9222` with multi-context support for testing multi-user scenarios.

```bash
# Create isolated contexts
curl -X POST localhost:9222/contexts -d '{"name":"user-a"}'
curl -X POST localhost:9222/contexts -d '{"name":"user-b"}'
```

**Key endpoints:** `/contexts`, `/pages`, `/navigate`, `/click`, `/fill`, `/screenshot`, `/eval`

Each context has isolated cookies/localStorage and persists via storage state. See `scripts/ralph/browser-instructions.md` for full API.

**Optional security:** set `RALPH_BROWSER_TOKEN` and send `Authorization: Bearer <token>` (or `X-Ralph-Token`).
**Bind host:** set `RALPH_BROWSER_HOST` (default `127.0.0.1`).

## Advanced Features

### Rate Limit Handling

Detects rate limits and pauses with exponential backoff (5 → 10 → 20 → 30min max). Iteration counter not incremented during wait.

### Learning Consolidation

At PRD completion, Ralph:
1. Reads `guardrails.md` + `progress.txt`
2. Validates existing items in `CLAUDE.md`/`AGENTS.md`
3. Removes outdated, adds new (no duplicates)
4. Commits documentation updates

### Stale Detection

Stories stuck `in_progress` too long auto-reset to `open`:
```bash
STALE_SECONDS=900 ./scripts/ralph/ralph.sh auto "feature"
```

### Code Quality

Ralph enforces: no unnecessary comments, remove useless ones, maintain consistency, clean as you go.

## Monitoring

### TUI Dashboard (Recommended)

Real-time dashboard with progress bar, current story, activity feed:

```bash
# Auto-detect (finds tasks/prd.json in cwd or worktree)
./scripts/ralph/ralph-monitor.sh

# Explicit path
./scripts/ralph/ralph-monitor.sh /path/to/worktree

# For --no-worktree mode (from project root)
./scripts/ralph/ralph-monitor.sh .
```

**Features:**
- Live progress bar
- Current story indicator
- Recent activity feed
- Latest commits
- Auto-refresh every 2s
- Auto-detects worktree or current directory

**Controls:** `q` quit, `r` refresh

### CLI Monitoring

```bash
jq '.userStories[] | {id, status}' tasks/prd.json  # Status
tail -20 tasks/activity.log                         # Activity
./scripts/ralph/overview.sh                         # Summary
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Claude not found | Install from [claude.ai/code](https://claude.ai/code) |
| Stories resetting | `STALE_SECONDS=1200 ./scripts/ralph/ralph.sh ...` |
| Slow execution | Add `--multi-agent` |
| Rate limited | Wait for backoff or Ctrl+C and resume later |
| Resume session | `cd worktree && ./scripts/ralph/ralph.sh auto "name" --no-worktree` |

## Credits

Based on [Ralph](https://github.com/snarktank/ralph) by Geoffrey Huntley, adapted for Claude Code CLI.

## License

MIT
