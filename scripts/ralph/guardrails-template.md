# Guardrails - Lessons Learned

> Persistent rules and patterns learned during development.
> This file is read at the START of each iteration.
> Add new learnings when you discover important patterns or gotchas.

## Project-Specific Rules

<!-- Add rules specific to this project as you discover them -->

## Patterns to Follow

<!-- Document patterns that work well -->

## Anti-Patterns to Avoid

<!-- Document approaches that failed or caused problems -->

## Useful Commands

<!-- Commands that proved helpful during development -->

---

## How to Update This File

When you discover something important during an iteration:

1. **Add it immediately** - Don't wait until the end
2. **Be specific** - Include file paths, error messages, or code snippets
3. **Explain why** - Help future iterations understand the reasoning
4. **Keep it organized** - Use the sections above

Example entry:
```
### 2024-01-15: Database migration order matters
- Always run `php artisan migrate:fresh` before testing
- Foreign key constraints require specific order
- Discovered when US-003 failed due to missing table
```
