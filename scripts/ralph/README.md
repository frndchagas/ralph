# Ralph - Autonomous AI Agent Loop

Ralph is an autonomous loop system that executes Claude Code CLI repeatedly to complete all tasks in a PRD.

Based on the [Ralph pattern](https://github.com/snarktank/ralph) by Geoffrey Huntley, adapted for Claude Code CLI.

## Concept

```
┌─────────────────────────────────────────────────────────┐
│                    RALPH LOOP                           │
├─────────────────────────────────────────────────────────┤
│  0. Creates isolated worktree (ralph-<feature-slug>)    │
│  1. Reads prd.json (pending tasks)                      │
│  2. Reads progress.txt (previous learnings)             │
│  3. Executes Claude Code with prompt.md                 │
│  4. Claude works on highest priority task               │
│  5. Commit + update prd.json + progress.txt             │
│  6. Repeat until <promise>COMPLETE</promise> or limit   │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Create PRD (inside Claude)
/prd

# 2. Convert PRD to JSON (inside Claude)
/prd-to-json tasks/prd-my-feature.md

# 3. Run Ralph
./scripts/ralph/ralph.sh auto "my-feature"
```

## Usage

```bash
./scripts/ralph/ralph.sh [max_iterations] [feature_name]
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| max_iterations | auto | Max iterations (auto = stories + 30% margin, minimum 20) |
| feature_name | "feature" | Name for worktree and branch |

### Examples

```bash
# Basic usage with auto iterations
./scripts/ralph/ralph.sh auto "user-authentication"

# Specific feature with 30 iterations
./scripts/ralph/ralph.sh 30 "notification-system"

# Simple feature with 5 iterations
./scripts/ralph/ralph.sh 5 "fix-bug-login"
```

## Files

| File | Description |
|------|-------------|
| `ralph.sh` | Main loop script |
| `prompt.md` | Instructions for each Claude iteration |
| `archive/` | Directory for previous executions |

### Generated Files

| File | Description |
|------|-------------|
| `tasks/prd.json` | Structured tasks with status |
| `tasks/progress.txt` | Accumulated learnings from all iterations |

## prd.json Format

```json
{
  "title": "Feature Name",
  "description": "General description",
  "userStories": [
    {
      "id": "US-001",
      "title": "Create component X",
      "description": "As a user, I want...",
      "acceptanceCriteria": [
        "Criterion 1",
        "Criterion 2"
      ],
      "priority": 1,
      "passes": false
    }
  ]
}
```

## How It Works

### Each Iteration

1. **Clean Context**: Each Claude execution starts without memory of previous iterations
2. **Memory via Files**: Claude reads `prd.json` and `progress.txt` to understand current state
3. **One Task at a Time**: Works on highest priority user story that hasn't passed yet
4. **Quality**: Runs checks (typecheck, lint, tests) before committing
5. **Documentation**: Records learnings in `progress.txt` for future iterations
6. **Signaling**: Responds `<promise>COMPLETE</promise>` when everything is done

### Loop Termination

The loop terminates when:
- Claude emits `<promise>COMPLETE</promise>` (all tasks complete)
- Reaches maximum iteration limit
- Critical script error

## Monitoring

During execution:

```bash
# Task status
cat tasks/prd.json | jq '.userStories[] | {id, title, passes}'

# Learnings
cat tasks/progress.txt

# Commits
git log --oneline -10
```

### HTML Dashboard (Live)

```bash
./scripts/ralph/dashboard/start.sh /path/to/project
```

Then open `http://localhost:7420` for a live HTML view of progress, activity, and screenshots.

## Tips

1. **Small user stories**: Each story should be completable in one session
2. **Verifiable criteria**: Acceptance criteria should be objective
3. **Working tests**: Keep your test suite green
4. **Periodic review**: Monitor Ralph's progress
5. **Document patterns**: Update your project guidelines with discovered patterns

## Troubleshooting

### "prd.json not found"

```bash
# Check if it exists
ls tasks/prd.json

# If not, convert the PRD
/prd-to-json tasks/prd-[name].md
```

### Loop stuck on a task

```bash
# Check progress
cat tasks/progress.txt | tail -50

# Continue manually
claude

# Or restart
./scripts/ralph/ralph.sh 10 "[feature]"
```

## References

- [Ralph Original (snarktank)](https://github.com/snarktank/ralph)
- [Claude Code CLI](https://claude.ai/code)
