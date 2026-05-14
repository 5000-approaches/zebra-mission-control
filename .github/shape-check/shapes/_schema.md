# Shape YAML schema

A shape declares a class of feature work and lists the items a PR MUST add to count as complete.

## Fields

- `name` — kebab-case shape id. Must match filename without `.yml`.
- `description` — one-line plain-English summary used by `/shape-pick`.
- `keywords` — list of words `/shape-pick` matches against the task description.
- `required` — list of items. Every item is checked against the PR diff.
  - `id` — kebab-case item id used in failure messages.
  - `description` — one-line plain-English summary.
  - `check` — `regex` or `file-exists`.
  - `pattern` — for `regex`: a regex run against ADDED diff lines. For `file-exists`: a shell glob run against the list of files touched by the diff.

## Param substitution

Tag form in a PR body: `<shape>[<name>]`, e.g. `crud-resource[accounts]`.

The token `{name}` inside any `pattern` is replaced by the param at check time. Shapes that don't need a param can be tagged plain (`dashboard-overview`).

## Diff conventions used by checks

- `regex` runs against the concatenation of lines starting with `+` (excluding `+++` headers) — i.e. additions only.
- `file-exists` runs against the list of files in the diff (additions and modifications).

## Adding a new shape

1. Drop `<shape-name>.yml` here.
2. `yamllint` must pass.
3. Add at most one entry per item id; keep `required` lean — every required item is a mandatory gate, so anything optional should NOT be listed.
4. If no existing shape fits a task, log a one-liner to `_gaps.md` instead of inventing a shape on the spot.
