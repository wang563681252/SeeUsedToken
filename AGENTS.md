# Codex Project Instructions

This repository includes project-local Codex agents and skills converted from the existing `.github` assistant configuration.

## Agent Usage

Use the narrowest agent that matches the task:

- `researcher`: map relevant files, dependencies, tests, and implementation patterns before changes.
- `planner`: create small implementation plans for multi-step work.
- `implementer`: make focused code changes and run targeted validation.
- `frontend-engineer`: handle React, TypeScript, CSS, accessibility, and browser-facing UI work.
- `browser-tester`: verify local web app flows, screenshots, console logs, accessibility, and responsive behavior.
- `debugger`: diagnose failing tests, stack traces, runtime errors, and regressions before fixes.
- `reviewer`: review diffs, plans, and code for bugs, regressions, security issues, and missing tests.
- `refactorer`: simplify code while preserving behavior.
- `documentation-writer`: create and update project docs.

## Skill Usage

Project skills live in `.agents/skills`.

Useful skills for this repository:

- `context-map`: build a task file map before implementation.
- `web-coder`: web development, standards, accessibility, performance, and security.
- `webapp-testing`: Playwright-based browser validation.
- `polyglot-test-agent`: test generation and test coverage.
- `security-review`: vulnerability, dependency, and secret scanning.
- `refactor`: behavior-preserving refactoring.
- `documentation-writer`: Diataxis-style documentation.
- `commit-message-storyteller`: Conventional Commit messages from diffs.

## Working Style

- Read existing files before editing.
- Prefer existing patterns over new abstractions.
- Keep edits scoped to the request.
- Add or update tests when behavior changes.
- Run the most relevant validation command available.
- Report any validation that could not be run.
