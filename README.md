# Ralph

> Autonomous AI Agent Loop for **Claude Code CLI**

Ralph is a system that enables [Claude Code CLI](https://claude.ai/code) to autonomously complete entire features by iterating through a PRD (Product Requirements Document). Each iteration, Claude works on one user story, commits changes, documents learnings, and continues until all tasks are complete.

## Why Claude Code?

Ralph is specifically designed for **Claude Code CLI** and leverages its unique capabilities:

- **Persistent context**: Claude Code maintains conversation state across iterations
- **Tool access**: Direct file system, git, and shell access via CLI tools
- **Subagent system**: Can spawn specialized agents for parallel work (explore, plan, review)
- **Permission management**: Uses `--dangerously-skip-permissions` for autonomous operation

## Features

- **Autonomous execution**: Runs Claude Code in a loop until feature is complete
- **Persistent memory**: Uses `progress.txt` to share learnings across iterations
- **Guardrails**: Persistent lessons learned that guide future iterations
- **PRD-driven**: Structured task management via JSON
- **Granular status**: Stories have `open|in_progress|done` status with timestamps
- **Git worktrees**: Isolated development environment per feature
- **Progress tracking**: Visual progress bars and status updates
- **Stall detection**: Warns if stuck on the same task
- **Stale detection**: Auto-resets stories stuck for too long (configurable timeout)
- **Activity log**: Timestamped log of all story transitions
- **Multi-agent mode** (optional): Leverages Claude's parallel subagents for faster execution
- **Browser automation** (optional): Playwright-based browser for UI testing

## Quick Start

### 1. Install Dependencies

- **[Claude Code CLI](https://claude.ai/code)** - Required
- [jq](https://stedolan.github.io/jq/) (`brew install jq`)
- Git
- [Bun](https://bun.sh) (only for `--browser` mode)

### 2. Install Ralph in Your Project

```bash
# Clone Ralph to a temp directory
git clone https://github.com/frndchagas/ralph.git /tmp/ralph

# Copy commands to your project (create .claude if needed)
mkdir -p /path/to/your/project/.claude
cp -r /tmp/ralph/.claude/commands /path/to/your/project/.claude/

# Copy scripts to your project
mkdir -p /path/to/your/project/scripts
cp -r /tmp/ralph/scripts/ralph /path/to/your/project/scripts/

# Cleanup
rm -rf /tmp/ralph
```

Or as a one-liner:
```bash
git clone https://github.com/frndchagas/ralph.git /tmp/ralph && \
  mkdir -p .claude scripts && \
  cp -r /tmp/ralph/.claude/commands .claude/ && \
  cp -r /tmp/ralph/scripts/ralph scripts/ && \
  rm -rf /tmp/ralph
```

### 3. Create a PRD

Inside Claude Code:
```
/prd
```

Answer the clarifying questions to generate a structured PRD.

### 4. Convert to JSON

```
/prd-to-json tasks/prd-my-feature.md
```

### 5. Run Ralph

```bash
./scripts/ralph/ralph.sh auto "my-feature"
```

## Workflow

```
┌─────────────────────────────────────────────────────────┐
│                    RALPH LOOP                           │
├─────────────────────────────────────────────────────────┤
│  1. Creates isolated worktree (ralph-<feature>)         │
│  2. Reads prd.json for pending tasks                    │
│  3. Reads progress.txt for previous learnings           │
│  4. Executes Claude Code with agent prompt              │
│  5. Claude implements highest priority incomplete story │
│  6. Commits + updates prd.json + progress.txt           │
│  7. Repeats until COMPLETE or iteration limit           │
└─────────────────────────────────────────────────────────┘
```

## Project Structure

```
your-project/
├── .claude/
│   └── commands/
│       ├── prd.md           # PRD generator command
│       ├── prd-to-json.md   # JSON converter command
│       ├── ralph.md         # Ralph documentation
│       └── overview.md      # Overview generator command
├── scripts/
│   └── ralph/
│       ├── ralph.sh         # Main loop script
│       ├── overview.sh      # Generate markdown summary
│       ├── prompt.md        # Agent instructions
│       ├── parallel-instructions.md  # Multi-agent instructions
│       ├── guardrails-template.md    # Template for guardrails
│       ├── browser-instructions.md   # Browser API docs
│       ├── archive/         # Previous run archives
│       └── browser/         # Browser automation (optional)
│           ├── src/server.ts
│           ├── start.sh
│           └── stop.sh
└── tasks/
    ├── prd-feature.md       # Generated PRD
    ├── prd.json             # JSON for Ralph
    ├── progress.txt         # Iteration learnings
    ├── guardrails.md        # Persistent lessons learned
    └── activity.log         # Story transition log
```

## Commands

| Command | Description |
|---------|-------------|
| `/prd` | Create a structured PRD |
| `/prd-to-json` | Convert PRD markdown to JSON |
| `/ralph` | Documentation and help |
| `/overview` | Generate markdown summary of PRD progress |

## CLI Usage

```bash
./scripts/ralph/ralph.sh [max_iterations] [feature_name] [options]
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| max_iterations | auto | Max iterations (auto = stories + 30%) |
| feature_name | "feature" | Name for worktree and branch |
| --multi-agent | off | Enable parallel subagents for faster execution |
| --browser | off | Enable headless browser automation |
| --browser-visible | off | Enable browser with visible window |

### Examples

```bash
# Auto-calculate iterations from PRD
./scripts/ralph/ralph.sh auto "user-auth"

# Fixed 30 iterations
./scripts/ralph/ralph.sh 30 "payment-system"

# Quick 5-iteration run
./scripts/ralph/ralph.sh 5 "bug-fix"

# With multi-agent mode (faster, parallel exploration)
./scripts/ralph/ralph.sh auto "complex-feature" --multi-agent

# With browser automation (headless)
./scripts/ralph/ralph.sh auto "checkout-flow" --browser

# With visible browser (for debugging)
./scripts/ralph/ralph.sh auto "login-tests" --browser-visible

# Combined: multi-agent + browser
./scripts/ralph/ralph.sh auto "e2e-feature" --multi-agent --browser
```

## Multi-Agent Mode

When `--multi-agent` is enabled, Ralph instructs Claude to leverage its **Task tool** to spawn specialized subagents for parallel work.

### How It Works

Claude Code has access to specialized agents via the `Task` tool:

| Agent Type | Purpose |
|------------|---------|
| `Explore` | Fast codebase exploration, file search, pattern matching |
| `Plan` | Architecture planning, implementation strategy |
| `code-reviewer` | Code review for bugs, security, quality |
| `code-explorer` | Deep feature analysis, dependency mapping |
| `test-runner` | Run test suites, identify failures |
| `type-checker` | TypeScript/PHP type checking |

### When to Use

- **Complex features** with many files to explore
- **Refactoring** tasks requiring codebase understanding
- **Features requiring tests** that need parallel test runs
- **Large codebases** where exploration takes time

### Performance Trade-offs

| Mode | Speed | Quality | Token Usage |
|------|-------|---------|-------------|
| Default | Normal | High | Lower |
| Multi-agent | Faster | High* | Higher |

*Quality remains high because subagents specialize in their tasks.

## Browser Mode

When enabled, Ralph starts a Playwright-based browser server that Claude can use for UI testing and validation.

### When to Use

- User stories involving UI validation
- Testing user flows (login, forms, checkout)
- Verifying visual elements
- Taking screenshots for documentation
- **Multi-user testing** (chat between users, collaboration features)

### Multi-Context Support

The browser supports **multiple isolated contexts**, each with its own cookies, localStorage, and session state. Perfect for testing multi-user scenarios.

```bash
# Create contexts for two users
curl -X POST localhost:9222/contexts -d '{"name":"user-a"}'
curl -X POST localhost:9222/contexts -d '{"name":"user-b"}'

# Each user has isolated state
curl -X POST localhost:9222/navigate -d '{"name":"p1","context":"user-a","url":"http://app/login"}'
curl -X POST localhost:9222/navigate -d '{"name":"p2","context":"user-b","url":"http://app/login"}'
```

### Browser API

The server runs on `http://localhost:9222` with these endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server status |
| GET | `/contexts` | List browser contexts |
| POST | `/contexts` | Create context `{name, clearData?}` |
| DELETE | `/contexts/:n` | Close context `(?clearData=true)` |
| GET | `/pages` | List open pages |
| POST | `/pages` | Create page `{name, context?}` |
| POST | `/navigate` | Navigate `{name, context?, url}` |
| POST | `/screenshot` | Screenshot `{name, context?, path?}` |
| POST | `/content` | Get content `{name, context?, selector?}` |
| POST | `/click` | Click `{name, context?, selector}` |
| POST | `/fill` | Fill `{name, context?, selector, value}` |
| POST | `/eval` | Run JS `{name, context?, script}` |
| POST | `/wait` | Wait `{name, context?, selector}` |
| DELETE | `/pages/:name` | Close page |

### Session Persistence

Each context maintains its own cookies and local storage:
- Data persists between navigations
- Data is saved to `.ralph-browser-data/context-{name}/`
- Use `clearData: true` to reset a user's state

## Advanced Features

### Guardrails (Lessons Learned)

Ralph maintains a `tasks/guardrails.md` file with persistent lessons learned across iterations. Unlike `progress.txt` (which tracks iteration progress), guardrails contain rules that Claude MUST follow.

```bash
# Example guardrails.md entry
### 2024-01-15: Database migrations
- Always run `php artisan migrate:fresh` before tests
- Foreign key constraints require specific order
```

### Stale Detection

If a story remains `in_progress` for too long, Ralph automatically resets it to `open`.

```bash
# Configure timeout (default: 600 seconds / 10 minutes)
STALE_SECONDS=900 ./scripts/ralph/ralph.sh auto "my-feature"
```

### Story Status

Stories now support granular status tracking:

| Status | Description |
|--------|-------------|
| `open` | Not started |
| `in_progress` | Currently being worked on |
| `done` | Completed |

With timestamps:
- `startedAt` - When work began (Unix timestamp)
- `completedAt` - When work finished (Unix timestamp)
- `staleCount` - Number of times story was reset due to stale detection

### Activity Log

All story transitions are logged to `tasks/activity.log`:

```
[2024-01-15 10:30:00] [US-001] [started] Beginning work on story
[2024-01-15 11:45:00] [US-001] [completed] Story finished successfully
[2024-01-15 12:00:00] [US-002] [started] Beginning work on story
[2024-01-15 12:45:00] [US-002] [reset] Story reset due to stale timeout
```

### Overview Command

Generate a human-readable summary of PRD progress:

```bash
# Print to stdout
./scripts/ralph/overview.sh

# Save to file
./scripts/ralph/overview.sh --save

# Or use the Claude command
/overview
```

## Claude Code Integration

Ralph is tightly integrated with Claude Code CLI:

### How Ralph Uses Claude Code

```bash
# Ralph runs this internally:
claude --dangerously-skip-permissions -p "$prompt"
```

- **`--dangerously-skip-permissions`**: Allows autonomous file/git operations
- **`-p`**: Passes the agent prompt directly

### Claude Code Tools Used

Ralph's prompt instructs Claude to use these Claude Code tools:

| Tool | Purpose in Ralph |
|------|------------------|
| `Read` | Read prd.json, progress.txt, guardrails.md |
| `Write` | Update prd.json, append to progress.txt |
| `Edit` | Modify code files |
| `Bash` | Run tests, git commands |
| `Task` | Spawn subagents (multi-agent mode) |
| `Grep/Glob` | Search codebase |

### MCP Servers

If your project has MCP servers configured, Claude Code will use them automatically:
- `laravel-boost` for Laravel projects
- `context7` for library documentation
- Browser automation MCPs

## Monitoring

```bash
# Task status (new format with status)
cat tasks/prd.json | jq '.userStories[] | {id, title, status}'

# Task status (legacy format)
cat tasks/prd.json | jq '.userStories[] | {id, title, passes}'

# Progress learnings
cat tasks/progress.txt

# Guardrails
cat tasks/guardrails.md

# Activity log
tail -20 tasks/activity.log

# Generate overview
./scripts/ralph/overview.sh

# Recent commits
git log --oneline -10
```

## Troubleshooting

### Claude Code Not Found

```bash
# Install Claude Code CLI
# Visit: https://claude.ai/code
```

### Stories Keep Resetting

```bash
# Increase stale timeout
STALE_SECONDS=1200 ./scripts/ralph/ralph.sh auto "my-feature"
```

### Slow Execution

```bash
# Enable multi-agent mode for parallel work
./scripts/ralph/ralph.sh auto "my-feature" --multi-agent
```

## Credits

Based on the [Ralph pattern](https://github.com/snarktank/ralph) by Geoffrey Huntley, adapted specifically for Claude Code CLI by Fernando Chagas.

## License

MIT
