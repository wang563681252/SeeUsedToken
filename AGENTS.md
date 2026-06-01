# Codex Project Instructions

This repository is SeeUsedToken: a CLI that reads local AI assistant logs and counts token usage without storing conversation content.

## Agent Usage

Use global Codex agents for general work. Prefer:

- `code-mapper` before broad changes to log-source parsing, aggregation, or CLI behavior.
- `debugger` for failing tests, parser regressions, and incorrect token totals.
- `code-reviewer` for privacy-sensitive diffs and behavior changes.
- `test-automator` when adding fixtures or parser coverage.
- `security-auditor` for handling local files, path inputs, secrets, or privacy boundaries.

## Skill Usage

Project skills live in `.agents/skills`. Keep this list intentionally small:

- `context-map`: build a task file map before implementation.
- `security-review`: vulnerability, dependency, and secret scanning.
- `refactor`: behavior-preserving refactoring.

Use global skills for generic commit, documentation, planning, browser, OpenAI docs, and regex work.

## Privacy Contract

- Count tokens, never conversations.
- Do not write prompt, response, or conversation text to CLI output, persisted records, debug logs, docs, or test snapshots.
- Text may be read transiently only when exact token counters are unavailable and local estimation is required.
- Persisted usage records should contain only source identity, timestamp, model, token counts, count method, and source file metadata.
- Tests may use synthetic marker text only to verify that content does not leak into parsed records or aggregates.

## Working Style

- Read existing files before editing.
- Prefer existing patterns over new abstractions.
- Keep edits scoped to the request.
- Add or update tests when behavior changes.
- Run the most relevant validation command available, usually `npm test`.
- Report any validation that could not be run.
