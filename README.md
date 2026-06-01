# SeeUsedToken

SeeUsedToken reads local AI assistant logs and counts token usage without storing
conversation content.

Supported sources:

- Claude Code
- Codex
- Gemini CLI
- GitHub Copilot CLI
- Hermes
- Kosmos
- OpenCode
- OpenClaw
- Pi
- PM Studio
- VS Code Copilot

## Usage

```sh
npm run sources
npm run scan
npm run monitor
node src/cli.js monitor --once
node src/cli.js scan --source-path codex=/path/to/codex.jsonl
node src/cli.js scan --source codex --max-files 10
node src/cli.js monitor --source codex --interval-ms 30000
```

The CLI prints JSON containing normalized usage records, aggregate totals, and
non-sensitive parsing issues.

Use `scan --summary` or `monitor` for compact totals instead of per-record
output.

## Privacy Contract

- Prompt, response, and conversation text is never written to CLI output.
- Text is read only transiently when a log lacks exact token counters and local
  estimation is needed.
- Persisted records contain only source identity, timestamp, model, token
  counts, count method, and source file metadata.
- Synthetic test fixtures may contain marker text, and tests assert those
  markers do not appear in parsed records or aggregates.

## Counting Behavior

Exact token fields are preferred when present. If no exact fields are available,
SeeUsedToken estimates locally and marks the record as `estimated`.

When a single log file contains both exact usage events and text-only events,
SeeUsedToken uses the exact usage events from that file and skips text
estimation for that file to avoid double-counting.

Run validation:

```sh
npm test
```
