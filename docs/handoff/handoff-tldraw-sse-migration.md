---
project: D:\workspaces\cc_workspaces\tldraw-project
created: 2026-09-17
topic: Replace polling with SSE + POST for real-time sync
status: Design complete, ready to implement
---

# Handoff: tldraw Polling → SSE Migration

## Context

This is a tldraw-based collaborative drawing app deployed via Docker, running `npx vite` as the production server (see `Dockerfile`). The current sync mechanism uses two polling loops that waste bandwidth on the production server at `http://127.0.0.1:3003`.

### Current Architecture (to be replaced)

- **`/api/drawing` poll**: 500ms interval, GET full tldraw snapshot, PUT full snapshot on local changes
- **`/api/shapes` poll**: 300ms interval, GET from in-memory shape queue, POST shape partials
- Server: Vite dev server middleware in `vite-plugin-tldraw-sync.ts`
- Client: polling logic in `src/useFileSync.ts`
- Storage: `drawing.json` on disk

### Use Case

Single user primarily, occasional 2-person collaborative editing on the same canvas. Both users must see each other's strokes in real time.

## Agreed Design

All decisions below were confirmed by the user through a structured Q&A session.

### 1. Communication: SSE + POST (not WebSocket)

SSE chosen because it works within the existing Vite middleware — no architecture migration needed. WebSocket deferred to a future iteration.

### 2. SSE Channel: `GET /api/events?clientId=xxx`

- On connect: push full snapshot as `drawing-snapshot` event
- On shape changes from other clients: push `shapes-updated` event with shape partials
- Broadcast skips the sender (filtered by `clientId`)

### 3. Write Operations (POST/PUT, unchanged endpoints)

- `POST /api/shapes` with `clientId` in body — push shape changes; server broadcasts via SSE to other clients
- `PUT /api/drawing` — full snapshot save (used as `beforeunload` fallback)

### 4. Snapshot Persistence

- **Debounced write**: 2-second debounce after last shape change → write merged state to `drawing.json`
- **Client fallback**: `beforeunload` sends PUT with full snapshot

### 5. Reconnection

- Browser `EventSource` native auto-reconnect (~3s)
- On reconnect: server re-sends full snapshot via SSE
- No event replay or message queue needed for 2-person scenario

### 6. Client Identity

- Each client generates `crypto.randomUUID()` on load
- Sent with SSE connection (query param) and POST requests (body field)
- Server maintains `Map<clientId, Response>` for SSE connections

### 7. What Gets Removed

- 500ms polling interval for `/api/drawing` in `useFileSync.ts`
- 300ms polling interval for `/api/shapes` in `useFileSync.ts`
- GET endpoint for `/api/shapes` (shape queue replaced by SSE push)

## Key Files

| File | Role |
|------|------|
| `vite-plugin-tldraw-sync.ts` | Server-side middleware — add SSE endpoint, modify shape POST to broadcast, add debounced write |
| `src/useFileSync.ts` | Client-side sync — replace polling with EventSource + POST |
| `src/tldrawValidation.ts` | Validation schemas — may need minor updates for clientId |
| `Dockerfile` | Deployment config (no changes needed for SSE) |
| `drawing.json` | Persistent storage (format unchanged) |

## Implementation Notes

- Vite middleware can handle SSE by writing headers and keeping the response open — no additional dependencies needed
- `EventSource` is natively supported in all modern browsers
- The shape queue (`shapeQueue` array in the plugin) can be removed; SSE replaces it
- Version tracking on `drawing.json` mtime can be simplified since SSE handles change notification

## Out of Scope (deferred)

- Migrating from Vite dev server to standalone Express/Fastify (future)
- WebSocket upgrade (future, when architecture migrates)
- Conflict resolution / OT / CRDT (2-person last-write-wins is acceptable for now)
- Production build optimization (static assets, compression)

## Suggested Skills

- `/grill-me` — if new design questions arise during implementation
- `/handoff` — to pass context to yet another session if needed

## Language Preference

User communicates in Chinese. Git commit messages must be in English (per saved memory `feedback_commit_language.md`).
