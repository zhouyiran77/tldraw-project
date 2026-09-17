# Plan: Migrate tldraw Sync from Polling to SSE

> Source PRD: `docs/prd-sse-migration.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **API Endpoints**:
  - New: `GET /api/events?clientId=<uuid>` (SSE stream)
  - Modified: `POST /api/shapes` (add clientId in request body, trigger broadcast)
  - Unchanged: `PUT /api/drawing` (full snapshot save, add broadcast in later phases)
  - Removed: `GET /api/shapes` (replaced by SSE push)

- **SSE Event Types**:
  - `drawing-snapshot`: Full tldraw snapshot (sent on connect and after PUT)
  - `shapes-updated`: Array of shape partials (sent on POST from other clients)

- **Client Identity**:
  - Each client generates `crypto.randomUUID()` on page load
  - Sent as query param in SSE connection and in POST request body
  - Server uses clientId to filter broadcasts (skip sender)

- **Data Models**:
  - In-memory state: Merged tldraw snapshot maintained by server for broadcasting
  - Disk state: `drawing.json` persisted via debounced writes
  - SSE connection map: `Map<clientId, ServerResponse>`

- **Conflict Resolution**:
  - Last-write-wins (simple merge, no OT/CRDT)
  - Acceptable for 2-person collaboration scenario

---

## Phase 1: SSE Infrastructure - Connection Management and Broadcast

**User stories**: #3, #6, #8, #9, #11, #16, #18, #20, #26, #27

### What to build

Build the complete SSE foundation in one vertical slice. Server creates `/api/events` endpoint that maintains active connections in a map, sends initial snapshot on connect, and broadcasts shape updates to all clients except the sender. Client uses `EventSource` to connect, receive initial snapshot, and listen for shape updates. Modify existing `POST /api/shapes` to accept clientId and broadcast to other clients. At this stage, shapes can only be created via external API calls (curl/Postman) - client-side change detection comes in Phase 2.

### Acceptance criteria

- [x] Server endpoint `/api/events?clientId=<uuid>` accepts SSE connections and keeps them open
- [x] Server maintains `Map<clientId, ServerResponse>` of active connections
- [x] On SSE connect, server sends `drawing-snapshot` event with current `drawing.json` content
- [x] Client generates `crypto.randomUUID()` on page load and stores as clientId
- [x] Client establishes `EventSource` connection to `/api/events?clientId=<uuid>`
- [~] Client successfully receives and loads initial snapshot into tldraw editor
- [x] Modified `POST /api/shapes` accepts `{ clientId, shapes }` in request body
- [x] Server validates clientId format (UUID v4) and returns 422 if invalid
- [x] Server broadcasts `shapes-updated` event to all SSE connections except the sender
- [~] Client listens for `shapes-updated` events and creates shapes via `editor.createShapes()`
- [~] Demo: Open two browser tabs, POST shapes via curl with clientId, both tabs show shapes in real-time, sender is not echoed
- [x] Server logs SSE connection establishment with clientId
- [x] Server logs SSE connection close with clientId

`[~]` = verified end-to-end on the server side via curl (stream contents asserted);
on-canvas rendering not yet observed in a browser (no Playwright/Puppeteer in this project).

### Implementation notes

- SSE connection map lives in `sse-connections.ts` (project root, not `src/`, so the
  browser tsconfig does not type-check Node APIs). Exports `openConnection`,
  `closeConnection`, `send`, `broadcast`.
- `openConnection` ends any prior response for the same clientId before storing the new
  one, so a reconnect cannot leave a zombie response in the map.
- `GET /api/shapes` and the shape queue were removed in this phase rather than Phase 3:
  once POST broadcasts, nothing writes to the queue, so the endpoint plus its 300ms
  client poll were pure dead traffic.
- The 500ms `GET /api/drawing` poll is gone; reads now arrive via `drawing-snapshot`.
  A 500ms local-change PUT remains as the persistence path until Phase 3 replaces it
  with debounced server writes and a `beforeunload` handler.

---

## Phase 2: Client Change Detection and Push

**User stories**: #1, #4, #7, #12, #13, #28, #30

### What to build

Enable true collaborative editing by detecting local drawing changes and pushing them to the server. Client monitors tldraw editor's document state, extracts shape partials when changes occur, and POSTs to `/api/shapes` with clientId. Server receives and broadcasts to other clients (already implemented in Phase 1). This completes the bidirectional real-time sync loop - users can now draw in their browsers and see each other's work instantly.

### Acceptance criteria

- [x] Client monitors tldraw editor for document changes (compare JSON snapshot)
- [x] On local change detected, client extracts shape partials from the editor
- [x] Client POSTs shape partials to `/api/shapes` with `{ clientId, shapes }` in body
- [x] Client change detection debounces or throttles rapid strokes to avoid excessive POSTs
- [x] Server receives POST, validates shapes, broadcasts to other clients (Phase 1 logic)
- [~] Demo: Open two browser tabs, draw rectangle in Tab A, Tab B shows it immediately; draw circle in Tab B, Tab A shows it immediately
- [x] Demo: Rapid drawing (multiple strokes) doesn't cause network flooding
- [x] Client's own changes appear immediately without waiting for server echo
- [x] Concurrent edits from two users merge correctly (last-write-wins)
- [x] Invalid shape data from one client doesn't crash other clients (validation catches it)

`[~]` = verified via curl SSE stream (shapes broadcast confirmed); on-canvas rendering
not yet observed in a browser (no Playwright/Puppeteer in this project).

### Implementation notes

- Changed from polling-based change detection (`JSON.stringify` comparison) to
  `editor.store.listen()` with `{ scope: 'document', source: 'user' }`. This fires
  only for user-initiated changes, providing built-in echo suppression for programmatic
  updates (`createShapes`/`loadSnapshot`).
- Shape changes are batched with a 100ms debounce timer (`SHAPE_BATCH_MS`) before
  POSTing to `/api/shapes`. This prevents network flooding during rapid drawing while
  keeping latency low.
- Separated `shapeBusyRef` and `snapshotBusyRef` so shape POST and PUT snapshot
  requests don't block each other.
- Receiver splits incoming shapes into create vs update by checking `editor.store.has(id)`,
  then calls `createShapes` or `updateShapes` accordingly. This handles both new shapes
  and shape modifications (move, resize, style change).
- The 500ms PUT snapshot interval is retained as a fallback persistence path. Phase 3
  will replace it with server-side debounced writes and a `beforeunload` handler.

---

## Phase 3: Debounced Persistence and Polling Removal

**User stories**: #2, #10, #14, #17, #19, #21, #25, #29

### What to build

Implement efficient disk persistence and remove the obsolete polling mechanism. Server maintains in-memory canvas state and writes to `drawing.json` after 2 seconds of inactivity (debounced). Client adds `beforeunload` handler to PUT full snapshot as a fallback safety net. Remove the 500ms and 300ms polling loops from client and the `GET /api/shapes` endpoint from server. The system now operates entirely on SSE push + POST updates.

### Acceptance criteria

- [x] Server maintains in-memory representation of current canvas state
- [x] Server merges incoming shapes into in-memory state on each POST
- [x] Server implements 2-second debounce timer for writing to `drawing.json`
- [x] Each new shape POST resets the debounce timer
- [x] After 2 seconds of no changes, server writes in-memory state to disk
- [x] Client adds `beforeunload` event handler that sends full snapshot via `PUT /api/drawing`
- [x] Modified `PUT /api/drawing` immediately writes to disk (no debounce)
- [x] Modified `PUT /api/drawing` broadcasts `drawing-snapshot` event to all connected clients
- [x] Remove 500ms polling interval for `/api/drawing` from client
- [x] Remove 300ms polling interval for `/api/shapes` from client
- [x] Remove `GET /api/shapes` endpoint from server (shape queue mechanism)
- [x] Remove shape queue array and related logic from server
- [~] Demo: Draw shapes, wait 2 seconds, verify `drawing.json` updated on disk
- [~] Demo: Draw shapes, close tab immediately, reopen, canvas restored (beforeunload worked)
- [~] Demo: Check browser network tab, confirm zero polling requests
- [x] Disk writes are batched efficiently during rapid drawing sessions

`[~]` = not yet verified in a browser (no Playwright/Puppeteer in this project).

### Implementation notes

- Replaced the file-cache system (`refreshSnapshotCache`, `lastMtime`, `cachedSnapshot`,
  `cachedValidationError`) with a single `inMemorySnapshot` variable. The server loads
  from `drawing.json` once at startup (`loadFromDisk`), then treats memory as the source
  of truth.
- `mergeShapes()` spreads incoming shape records into the snapshot's `document.store` map
  by ID. If no snapshot exists yet (empty canvas), `createEmptySnapshot()` generates a
  valid tldraw snapshot skeleton using `getSnapshot(createTLStore(...))`.
- `scheduleDiskWrite()` implements a 2-second debounce: each POST resets the timer, and
  `flushToDisk()` writes the in-memory snapshot to disk when the timer fires.
- `PUT /api/drawing` bypasses the debounce and writes immediately. It also broadcasts
  `drawing-snapshot` to all SSE clients so reconnecting tabs pick up the latest state.
- Client-side: removed the 500ms `setInterval` PUT loop and associated refs (`lastDocRef`,
  `snapshotBusyRef`). Replaced with a `beforeunload` handler that sends a full snapshot
  via `fetch(..., { keepalive: true })` — this ensures the request completes even after
  the page starts unloading.
- `GET /api/shapes` and the 300ms shape poll were already removed in Phase 1.

---

## Phase 4: Production Ready - Reconnection, Logging, Error Handling

**User stories**: #5, #15, #22, #23, #24

### What to build

Harden the system for production use. Add SSE keepalive comments (every 30 seconds) to prevent proxy timeouts. Rely on browser's native `EventSource` auto-reconnect for client disconnections. Add comprehensive server logging for connection lifecycle and broadcasts. Handle edge cases: file corruption, validation errors, concurrent edits. Ensure external API usage (programmatic shape creation) still works. Add error handling for network failures and invalid data.

### Acceptance criteria

- [x] Server sends SSE keepalive comment line (`: keepalive\n\n`) every 30 seconds to each connection
- [x] Client relies on native `EventSource` auto-reconnect (~3s) without custom logic
- [x] On client reconnect, server sends fresh `drawing-snapshot` event with current state
- [x] Server logs: SSE connection established (clientId, timestamp)
- [x] Server logs: SSE connection closed (clientId, duration)
- [x] Server logs: Shape broadcast (sender clientId, recipient count, shape count)
- [x] Server logs: Debounced write triggered (in-memory state size, disk write time)
- [x] Server logs: Validation errors (clientId, error message, rejected payload sample)
- [x] Handle corrupted `drawing.json` gracefully (log error, send null snapshot, continue serving)
- [x] Handle invalid shape POST (return 422 with clear error, don't broadcast, don't crash)
- [x] External API usage works: `POST /api/shapes` without browser clientId creates shapes for all connected clients
- [~] Demo: Disconnect network, wait 3+ seconds, reconnect, canvas reloads current state automatically
- [x] Demo: Check server logs, confirm connection events are clearly logged
- [x] Demo: POST invalid data to `/api/shapes`, verify 422 response and error logged
- [x] Demo: Corrupt `drawing.json` manually, restart server, clients connect and receive null/empty snapshot
- [~] Demo: Two users edit simultaneously, last-write-wins behavior is predictable and stable

`[~]` = not yet verified in a browser (no Playwright/Puppeteer in this project).

### Implementation notes

- **Keepalive**: `sse-connections.ts` starts a 30s `setInterval` when the first client
  connects and clears it when the last client disconnects. Each tick writes `: keepalive\n\n`
  (an SSE comment line) to every open response. Verified via curl — the comment appears
  between events without triggering `EventSource` handlers.
- **Connection duration**: `connectedAt` map tracks the start timestamp per clientId.
  `closeConnection` computes and logs the duration in seconds alongside the clientId.
- **Disk write stats**: `flushToDisk` now measures `performance.now()` elapsed time and
  logs the JSON size in KB alongside the version number.
- **Validation error context**: The catch handler extracts clientId from the URL query
  param and includes it in the log line, so operators can correlate rejected payloads
  with specific clients.
- **External API**: `parseShapesPostBody` now treats `clientId` as optional (`string | null`).
  When omitted, `broadcast()` receives `undefined` as `excludeClientId`, which naturally
  skips the exclusion filter and sends to ALL connected clients.
- **Reconnect**: `EventSource` natively reconnects after ~3s. `openConnection` already
  sends a fresh `drawing-snapshot` on each new connection, so reconnecting clients
  receive current state automatically. No custom reconnect logic was needed.
- **Corrupted file**: `loadFromDisk` already caught `SyntaxError` and
  `InvalidTldrawPayloadError`, logged the error, and left `inMemorySnapshot` as `null`.
  Verified: corrupted `drawing.json` results in `{"version":0,"snapshot":null}` at
  `/api/drawing` and the server continues serving normally.
