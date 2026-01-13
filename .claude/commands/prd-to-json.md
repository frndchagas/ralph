---
description: "Converts a PRD markdown to structured JSON format (prd.json). Use before running Ralph."
---

# PRD to JSON Converter

Converts a markdown PRD to the structured JSON format used by Ralph.

## Usage

```
/prd-to-json [path-to-prd]
```

## What to do

1. **Read the PRD markdown** specified by user
2. **Extract user stories** from "User Stories" section
3. **Convert to JSON** in format below
4. **Save** to `tasks/prd.json`

## Output Format (prd.json)

```json
{
  "title": "Feature Name",
  "description": "Feature description from Introduction",
  "createdAt": "2025-01-12T10:00:00Z",
  "sourceFile": "tasks/prd-name.md",
  "userStories": [
    {
      "id": "US-001",
      "title": "Story Title",
      "description": "As a [user], I want [feature] so that [benefit].",
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
      "priority": 1,
      "passes": false
    }
  ]
}
```

## Conversion Rules

1. **title**: Extract from `# PRD: [Name]`
2. **description**: Extract from `## Introduction` section
3. **userStories**: Each `### US-XXX:` becomes a story
4. **id**: Keep original ID (US-001, US-002, etc)
5. **priority**: Order of appearance (1, 2, 3...)
6. **passes**: Always `false` initially

## Validation

```bash
cat tasks/prd.json | jq .
cat tasks/prd.json | jq '.userStories[] | {id, title, passes}'
```

## Checklist

- [ ] Read the specified PRD file
- [ ] Extracted all user stories
- [ ] Converted to valid JSON
- [ ] Saved to `tasks/prd.json`
- [ ] Confirmed JSON is valid with `jq`
