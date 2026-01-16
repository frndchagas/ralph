# Ralph HTML Dashboard

Live HTML dashboard for Ralph runs. Reads data from a project's `tasks/` folder and updates in real time.

## Usage

From the Ralph repo:

```bash
./scripts/ralph/dashboard/start.sh /path/to/project
```

Optional env vars:

- `PORT=7420` (default)
- `WORK_DIR=/path/to/project` (alternative to passing the path)
- `STALE_SECONDS=600` (stale threshold)
- `RALPH_DASHBOARD_TRANSLATE=0` (disable content translation via Claude CLI)

Then open:

```
http://localhost:7420
```

## Data sources

- `tasks/prd.json`
- `tasks/activity.log`
- `tasks/progress.txt`
- `tasks/guardrails.md`
- `tasks/screenshots/`

## Notes

- The dashboard highlights inconsistencies (missing screenshots, resets, started-but-not-completed stories).
- Screenshot viewer includes zoom, keyboard navigation, and carousel controls.
- Status mapping treats `status: completed` as done, but it will warn since Ralph expects `done`.
