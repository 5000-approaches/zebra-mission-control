@AGENTS.md

## Git safety (installed by /repo-ready)

- Never push to `main` and never merge a pull request to `main` — `dev` is where work lands, and Rune promotes.
- Every change rides a pull request into `dev`; direct pushes are for emergencies only.
- Run the test command and report its exact count before every commit and PR.

## Proof (installed by /repo-ready)

- Every change a person could watch run ships with a picture, clip or video committed under `screenshots/` in the same change.
- Links to pictures use BOTH forms, because this repo is private: an HTML `<img src="https://github.com/OWNER/REPO/blob/BRANCH/FILE?raw=true" width="480">` tag, and the plain blob link under it. Never markdown image syntax, never raw.githubusercontent.
