# Ralph

> Autonomous AI Agent Loop for Claude Code CLI

Ralph is a system that enables Claude Code to autonomously complete entire features by iterating through a PRD (Product Requirements Document). Each iteration, Claude works on one user story, commits changes, documents learnings, and continues until all tasks are complete.

## Features

- **Autonomous execution**: Runs Claude Code in a loop until feature is complete
- **Persistent memory**: Uses `progress.txt` to share learnings across iterations
- **PRD-driven**: Structured task management via JSON
- **Git worktrees**: Isolated development environment per feature
- **Progress tracking**: Visual progress bars and status updates
- **Stall detection**: Warns if stuck on the same task
- **Browser automation** (optional): Playwright-based browser for UI testing

## Quick Start

### 1. Install Dependencies

- [Claude Code CLI](https://claude.ai/code)
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
│       └── ralph.md         # Ralph documentation
├── scripts/
│   └── ralph/
│       ├── ralph.sh         # Main loop script
│       ├── prompt.md        # Agent instructions
│       ├── browser-instructions.md  # Browser API docs
│       ├── archive/         # Previous run archives
│       └── browser/         # Browser automation (optional)
│           ├── src/server.ts
│           ├── start.sh
│           └── stop.sh
└── tasks/
    ├── prd-feature.md       # Generated PRD
    ├── prd.json             # JSON for Ralph
    └── progress.txt         # Iteration learnings
```

## Commands

| Command | Description |
|---------|-------------|
| `/prd` | Create a structured PRD |
| `/prd-to-json` | Convert PRD markdown to JSON |
| `/ralph` | Documentation and help |

## CLI Usage

```bash
./scripts/ralph/ralph.sh [max_iterations] [feature_name] [--browser] [--browser-visible]
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| max_iterations | auto | Max iterations (auto = stories + 30%) |
| feature_name | "feature" | Name for worktree and branch |
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

# With browser automation (headless)
./scripts/ralph/ralph.sh auto "checkout-flow" --browser

# With visible browser (for debugging)
./scripts/ralph/ralph.sh auto "login-tests" --browser-visible
```

## Browser Mode

When enabled, Ralph starts a Playwright-based browser server that Claude can use for UI testing and validation.

### When to Use

- User stories involving UI validation
- Testing user flows (login, forms, checkout)
- Verifying visual elements
- Taking screenshots for documentation

### Browser API

The server runs on `http://localhost:9222` with these endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server status |
| GET | `/pages` | List open pages |
| POST | `/pages` | Create named page |
| POST | `/navigate` | Navigate to URL |
| POST | `/screenshot` | Take screenshot |
| POST | `/content` | Get page content |
| POST | `/click` | Click element |
| POST | `/fill` | Fill input field |
| POST | `/eval` | Run JavaScript |
| POST | `/wait` | Wait for element |
| DELETE | `/pages/:name` | Close page |

### Session Persistence

Cookies and local storage persist between navigations. Login once and the session is maintained.

## Monitoring

```bash
# Task status
cat tasks/prd.json | jq '.userStories[] | {id, title, passes}'

# Progress learnings
cat tasks/progress.txt

# Recent commits
git log --oneline -10
```

## Credits

Based on the [Ralph pattern](https://github.com/snarktank/ralph) by Geoffrey Huntley.

## License

MIT
