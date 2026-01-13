---
description: "Starts the Ralph autonomous loop to complete all tasks from a PRD. Use when you have a prd.json ready."
---

# Ralph - Autonomous AI Agent Loop

Execute the Ralph loop to autonomously complete all user stories in a PRD.

## Usage

```bash
./scripts/ralph/ralph.sh [max_iterations] [feature_name]
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| max_iterations | auto | Max iterations (auto = stories + 30%) |
| feature_name | "feature" | Name for worktree and branch |

## Examples

```bash
# Auto iterations based on PRD
./scripts/ralph/ralph.sh auto "user-auth"

# Specific iteration count
./scripts/ralph/ralph.sh 30 "notification-system"
```

## Prerequisites

1. Create PRD: `/prd`
2. Convert to JSON: `/prd-to-json tasks/prd-feature.md`
3. Run Ralph: `./scripts/ralph/ralph.sh auto "feature-name"`

## What Ralph Does

1. Creates isolated worktree (ralph-<feature>)
2. Reads prd.json for pending tasks
3. Reads progress.txt for learnings
4. Executes Claude Code with agent prompt
5. Works on highest priority incomplete story
6. Commits + updates prd.json + progress.txt
7. Repeats until `<promise>COMPLETE</promise>` or limit

## Monitoring

```bash
# Task status
cat tasks/prd.json | jq '.userStories[] | {id, title, passes}'

# Learnings
cat tasks/progress.txt

# Recent commits
git log --oneline -10
```
