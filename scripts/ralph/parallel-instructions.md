# Multi-Agent Mode Instructions

**MULTI-AGENT MODE ENABLED**: You have access to specialized subagents via the `Task` tool. Use them aggressively to parallelize work and increase efficiency.

## Available Subagents

Use these subagents via the `Task` tool with the `subagent_type` parameter:

| Subagent | When to Use |
|----------|-------------|
| `Explore` | Searching codebase, finding files, understanding structure |
| `Plan` | Designing implementation strategy, identifying files to modify |
| `code-reviewer` | Reviewing code for bugs, security issues |
| `code-explorer` | Deep analysis of existing features |
| `test-runner` | Running test suites |
| `type-checker` | TypeScript/PHP type checking |

## When to Spawn Subagents

### ALWAYS use subagents for:

1. **Codebase exploration**: Instead of running multiple Grep/Glob commands yourself, spawn an `Explore` agent:
   ```
   Task tool with subagent_type="Explore":
   "Find all files that handle user authentication, including models, controllers, and middleware"
   ```

2. **Parallel searches**: If you need to search for multiple patterns, spawn multiple agents in parallel:
   ```
   # In a single message, call Task multiple times:
   - Task(Explore): "Find all API endpoints related to payments"
   - Task(Explore): "Find all database migrations for orders table"
   - Task(Explore): "Find all event listeners for order events"
   ```

3. **Code review before commit**: After implementing changes, spawn a reviewer:
   ```
   Task tool with subagent_type="feature-dev:code-reviewer":
   "Review the changes I just made to the authentication system for bugs and security issues"
   ```

4. **Running tests**: Instead of running tests yourself, spawn a test runner:
   ```
   Task tool with subagent_type="proactive-scanner:test-runner":
   "Run the test suite and identify any failures"
   ```

5. **Type checking**: Before committing, verify types:
   ```
   Task tool with subagent_type="proactive-scanner:type-checker":
   "Check for TypeScript errors in the modified files"
   ```

## Parallel Task Pattern

When you have multiple independent tasks, spawn them ALL in a single message:

```markdown
I need to understand the codebase structure. Let me spawn parallel agents:

[Task 1: Explore] "Find all React components in src/components"
[Task 2: Explore] "Find all API routes in the backend"
[Task 3: Explore] "Find all database models"
```

The results will come back in parallel, saving significant time.

## Rules for Multi-Agent Mode

1. **Spawn early, spawn often**: Don't hesitate to use subagents for exploration
2. **Parallel when possible**: If tasks are independent, spawn them in the same message
3. **Use specialized agents**: Match the agent type to the task (Explore for search, code-reviewer for review)
4. **Trust subagent results**: Subagents are specialized - trust their findings
5. **Don't duplicate work**: If a subagent already searched something, don't re-search it yourself

## Example Workflow

### Story: "Add password reset functionality"

```markdown
## Step 1: Explore codebase (parallel)
[Spawn 3 agents in parallel:]
- Task(Explore): "Find existing authentication implementation"
- Task(Explore): "Find email sending utilities"
- Task(Explore): "Find similar CRUD patterns for reference"

## Step 2: Plan implementation
[After exploration results come back:]
- Task(Plan): "Design password reset feature based on existing patterns"

## Step 3: Implement
[Write the code based on plan and exploration]

## Step 4: Verify (parallel)
[Spawn 2 agents in parallel:]
- Task(code-reviewer): "Review password reset implementation"
- Task(test-runner): "Run authentication tests"

## Step 5: Commit
[If reviews pass, commit changes]
```

## Performance Tips

1. **Batch explorations**: Group related searches into a single Explore agent call
2. **Use descriptive prompts**: Give agents context about what you're building
3. **Trust haiku for simple tasks**: Use `model: "haiku"` for fast, simple explorations
4. **Background for long tasks**: Use `run_in_background: true` for long-running tests

## What NOT to Do

- ❌ Don't spawn agents for single-file reads (use Read tool directly)
- ❌ Don't spawn agents for simple grep patterns (use Grep tool directly)
- ❌ Don't spawn sequential dependent tasks in parallel (wait for dependencies)
- ❌ Don't spawn agents just to spawn agents (use judgment)

## Summary

Multi-agent mode is about **parallelizing work** and **using specialized agents**. The goal is to:
- Explore faster with parallel searches
- Get code reviews before committing
- Run tests automatically
- Maintain quality while increasing speed

Use the Task tool liberally whenever tasks can be parallelized or specialized.
