---
name: tldraw-chat
description: Operate the local tldraw whiteboard through its validated HTTP API and browser editor. Use when the user wants to inspect, draw on, or collaborate in the whiteboard.
---

# tldraw chat

## Core workflow

1. Check whether the Vite development server is already running and capture its origin (default port 3003).
2. If needed, run `npm run dev` in the background and read its output for the actual URL.
3. Request `GET <origin>/api/drawing` to confirm readiness and inspect the current snapshot.
4. Prefer the browser editor for normal drawing and page operations. Give the user the browser URL and keep the page open while collaborating.
5. When direct API access is needed, call the application endpoints directly:
   - `POST /api/shapes` for shape additions, updates, and removals.
   - `POST /api/records` for complete document-record changes, including pages.
6. Verify the result in the browser or by reading `GET /api/drawing` again.

## Rules

- Treat `drawing.json` as application-owned state. Never edit, replace, or reformat it directly.
- Do not create or rely on helper scripts or temporary payload files for routine operations.
- Preserve record IDs and shape `parentId` values. A shape must target its intended page; do not assume every connected client is viewing the same page.
- If the API rejects a request, fix the payload and report the validation error instead of bypassing validation.
- Keep the user-facing response brief and include the active browser URL.
