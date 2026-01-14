# Overview Command

Generate a human-readable markdown summary of the current PRD progress.

## Instructions

Read `tasks/prd.json` and generate a formatted markdown overview with:

1. **Header** with feature title and description
2. **Progress Summary** with completion statistics
3. **User Stories Table** with status icons
4. **Timeline** if timestamps are available

## Output Format

```markdown
# Feature: [Title]

> [Description]

## Progress

- **Total Stories:** X
- **Completed:** Y (Z%)
- **In Progress:** N
- **Open:** M

## User Stories

| Status | ID | Title | Started | Completed |
|--------|-----|-------|---------|-----------|
| ✅ | US-001 | [Title] | 2024-01-15 10:30 | 2024-01-15 11:45 |
| 🔄 | US-002 | [Title] | 2024-01-15 12:00 | - |
| ⬜ | US-003 | [Title] | - | - |

### Legend
- ✅ Done
- 🔄 In Progress
- ⬜ Open
- 🔁 Reset (stale)

## Activity Log (Last 10)

```
[timestamp] [story] [action] message
```

## Guardrails Summary

[If guardrails.md exists, include key points]
```

## Steps

1. Check if `tasks/prd.json` exists
2. Parse the JSON and extract all story information
3. Convert Unix timestamps to human-readable dates
4. Calculate progress statistics
5. Generate the markdown output
6. Optionally save to `tasks/overview.md` if requested

## Example Usage

```
/overview
```

Or to save:
```
/overview --save
```

## Notes

- This command is read-only and does not modify any files (except optionally creating overview.md)
- Works with both legacy `passes` format and new `status` format
- Timestamps are shown in local timezone
