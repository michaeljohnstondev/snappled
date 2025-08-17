CLAUDE.md — Snapples House Rules

Goal: Build Snapples in clear, traceable steps. Work on one screen at a time, extract reusable parts, and keep navigation and structure obvious so bugs are easy to find and fix.

0. Core Principles

KISS — Keep It Simple, Stupid.

YAGNI — You Aren’t Gonna Need It.

Single Responsibility — one purpose per file/function.

Fail Fast — validate inputs early; throw clear errors.

No hallucinated libraries — only use packages in package.json.

1. Tech & Assumptions

React Native (Expo), JavaScript (.js / .jsx).

'@react-navigation/native' for navigation.

Firebase v9 modular SDK (Auth / Firestore / Storage).

2. All UI + logic in src/.

3. Naming & Size Limits

Files < 500 lines, functions < 50 lines.

Line length ~100 chars.

PascalCase.jsx for components, camelCase.js for utils.

4. One Screen at a Time — Workflow

Scope: Only edit one screen and its reusable parts per task.

Allowed files:

Its route in app/

Its container in src/screens/<ScreenName>

Any new reusable parts under src/components extracted from this screen

Required service/helper for this screen

Forbidden: unrelated refactors, dependency changes, global state edits (unless needed — log in TASKS.md).

Steps:

Add/confirm TASKS.md entry: screen: <ScreenName> – goal.

Create the screen skeleton.

Build UI and hook it to services.

Extract reusable parts to src/components.

Manual checklist (see §5).

Mark task complete in TASKS.md.

5. Manual Sanity Checklist

Screen renders from its route without warnings.

Happy path works (main flow).

Edge case works (empty input/list).

Failure case shows error state.

Navigation back/forward works; no red screens.

Logs for errors/warnings are tagged [Screen:<Name>].

6. Code Organization Rules

components = dumb UI only (no network or state beyond props).

sscreens = screen containers (may use hooks, services).

services = all Firebase/API logic.

hooks = reusable hooks (no UI).

lib = pure helpers/utilities.

7. State & Data

All network/Firebase calls go through src/services.

8. Async, Network & Firebase

Wrap all Firebase calls in src/services.

Always handle loading / success / error states explicitly.

No secrets/tokens in logs.

9. Media Rules

Validate + compress video before upload.

Media processing logic lives in src/components/media or relevant service.

10. Errors & Logging

Throw early with clear messages in services.

Use [Screen:<Name>] in console logs for traceability.

User-facing errors should be friendly.

11. Tasks, Docs & Commits

Check TASKS.md before starting.

Mark tasks complete right after finishing.

Small, atomic commits:

feat:, fix:, refactor:, chore:.

Comment why, not just what.

12. AI Behavior

Never assume missing context — ask first.

Confirm file paths exist before referencing.

Do not add dependencies without package.json check + justification.

13. our ui has a punk theme. keep everything looking clean like a top notch grafitti artist.
