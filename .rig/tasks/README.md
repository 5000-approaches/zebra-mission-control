# .rig/tasks/<task>/evidence/ — where a build files its proof

Every pipeline task gets a folder here named after the task, with an
evidence/ folder inside split four ways:

- `evidence/checks/`   — test runs, gate runs, red-then-green terminal shots
- `evidence/frontend/` — screenshots and clips of the screens that changed
- `evidence/backend/`  — real requests and their real answers
- `evidence/scope/`    — the scope judge's verdict

The pictures that prove a PR go under `screenshots/` (the gate watches only
that folder); this cabinet is the per-task archive of everything else.
