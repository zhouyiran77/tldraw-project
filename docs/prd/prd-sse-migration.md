# PRD: Migrate tldraw Sync from Polling to Server-Sent Events

## Problem Statement

The current tldraw collaborative drawing application uses a dual-polling mechanism that generates excessive network traffic in production. Every 500ms, clients poll for full drawing snapshots, and every 300ms they poll for shape queue updates. This results in hundreds of unnecessary HTTP requests per minute even when the canvas is idle, wasting server bandwidth and increasing latency for real collaborative updates. For a production deployment at `http://127.0.0.1:3003`, this polling overhead is unacceptable for both single-user and 2-person collaborative scenarios.

## Solution

Replace the polling-based synchronization with a Server-Sent Events (SSE) push model combined with POST-based client updates. The server will maintain persistent SSE connections with each client and push updates only when actual changes occur. Clients will send their drawing changes via POST requests, and the server will broadcast these changes to other connected clients through their SSE channels. A debounced write mechanism will persist the canvas state to disk every 2 seconds after the last change, reducing disk I/O while maintaining data durability. The browser's native `EventSource` API will handle automatic reconnection without additional infrastructure.

## User Stories

1. As a single user editing a canvas, I want the application to stop sending hundreds of unnecessary network requests per minute, so that my bandwidth usage is minimized
2. As a single user, I want my drawing changes to be saved to disk automatically after I stop drawing, so that I don't lose work if the browser crashes
3. As a collaborative user, I want to see my partner's strokes appear in real-time, so that we can work together effectively
4. As a collaborative user, I want my own changes to appear immediately without waiting for a server round-trip, so that drawing feels responsive
5. As a collaborative user, I want the system to handle temporary network disconnections gracefully, so that I can continue working when my connection drops briefly
6. As a collaborative user, I want to receive the full current canvas state when I reconnect after being offline, so that I'm always synchronized with other users
7. As a developer deploying the application, I want to reduce server load from idle clients, so that hosting costs remain low
8. As a developer, I want the synchronization mechanism to work within the existing Vite middleware architecture, so that I don't need to refactor the deployment pipeline
9. As a user drawing complex shapes, I want my changes to be broadcasted to other users in real-time, so that they see my work as I create it
10. As a user, I want the application to save my work when I close the browser tab, so that nothing is lost during normal exit
11. As a user reconnecting after a disconnection, I want to see the current state of the canvas immediately, so that I know what happened while I was offline
12. As a collaborative user, I want my changes and my partner's changes to merge correctly, so that neither of our work is lost
13. As a user, I want the application to handle file corruption gracefully, so that one client's invalid data doesn't crash other clients
14. As a developer, I want validation errors to be logged clearly, so that I can debug synchronization issues quickly
15. As a user with a slow network connection, I want the application to handle reconnection automatically, so that I don't need to manually refresh the page
16. As a developer, I want each client to have a unique identifier, so that the server can route updates correctly
17. As a user, I want my drawing changes to persist across page refreshes, so that my work is always saved
18. As a collaborative user, I want to avoid seeing my own changes echoed back from the server, so that the drawing experience remains smooth
19. As a user making rapid stroke changes, I want the server to batch disk writes efficiently, so that performance remains high
20. As a developer monitoring the production server, I want to see clear logs when SSE connections are established or dropped, so that I can track active users
21. As a user working alone, I want the same robust persistence guarantees as collaborative mode, so that I never lose work
22. As a developer, I want the SSE connection to send keepalive signals, so that intermediate proxies don't close the connection prematurely
23. As a user, I want shape creation from external sources to still work via API, so that programmatic canvas manipulation remains possible
24. As a collaborative user, I want the last person editing to have their changes win, so that the behavior is predictable and simple
25. As a developer, I want to remove the now-obsolete shape queue mechanism, so that the codebase remains clean and maintainable
26. As a user, I want the application to work in all modern browsers without additional plugins, so that setup is simple
27. As a developer, I want the SSE endpoint to be part of the same middleware stack, so that authentication and CORS configuration remain consistent
28. As a user creating many shapes quickly, I want the system to handle high-frequency updates efficiently, so that the canvas remains responsive
29. As a developer, I want the disk persistence logic to be decoupled from the SSE broadcast logic, so that each concern can be tested independently
30. As a collaborative user, I want the system to handle the case where both users edit simultaneously, so that the application doesn't crash or corrupt data

## Implementation Decisions

### Architecture

- **SSE over WebSocket**: Use Server-Sent Events rather than WebSocket to leverage the existing Vite middleware architecture without introducing new server infrastructure. SSE provides sufficient capability for this use case (server-to-client push with client-to-server POST).
- **Keep Vite dev server in production**: Continue running `npx vite` as the production server (as configured in the Dockerfile). No migration to Express or Fastify at this time.
- **Last-write-wins conflict resolution**: For 2-person collaboration, the simplest approach is acceptable. No operational transformation (OT) or CRDT implementation needed.

### Server-Side Modules

- **SSE Connection Manager**
  - Maintain a `Map<clientId, ServerResponse>` of active SSE connections
  - Assign a unique `clientId` for each SSE connection via query parameter
  - Handle connection establishment, keepalive, and cleanup on disconnect
  - Broadcast messages to all connections except the sender

- **Event Broadcaster**
  - On new connection: send `drawing-snapshot` event with current full snapshot from disk
  - On shape changes: send `shapes-updated` event with shape partials to all clients except the sender
  - Format SSE messages according to the EventSource protocol (`event:`, `data:`, blank line)

- **Debounced Persistence Layer**
  - Accumulate shape changes in memory
  - After 2 seconds of inactivity (no new shape changes), write the merged state to `drawing.json`
  - Clear the debounce timer on each new change
  - Maintain an in-memory representation of the current canvas state for broadcasting and persistence

- **Modified Shape POST Handler**
  - Accept shape partials with `clientId` in the request body
  - Merge changes into in-memory state
  - Broadcast `shapes-updated` event to all SSE connections except the sender
  - Trigger the debounce timer for disk persistence

- **Modified Drawing PUT Handler**
  - Accept full snapshot (used as fallback during `beforeunload`)
  - Immediately write to `drawing.json` (no debounce for explicit saves)
  - Broadcast `drawing-snapshot` event to all connected clients

### Client-Side Modules

- **SSE Connection Manager**
  - Generate `crypto.randomUUID()` on page load and store as `clientId`
  - Establish `EventSource` connection to `/api/events?clientId=xxx`
  - Handle `drawing-snapshot` events by loading the full snapshot into the editor
  - Handle `shapes-updated` events by creating shapes via the editor API
  - Native `EventSource` auto-reconnect (~3s) handles network failures

- **Change Detector and Publisher**
  - Monitor the tldraw editor's document state for local changes
  - When changes detected, extract shape partials and POST to `/api/shapes` with `clientId` in body
  - Debounce or throttle POST requests to avoid excessive traffic during rapid drawing
  - On `beforeunload` event, send full snapshot via PUT to `/api/drawing` as a fallback safety mechanism

- **Removed Polling Loops**
  - Remove 500ms polling interval for `/api/drawing`
  - Remove 300ms polling interval for `/api/shapes`
  - Remove the GET handler for `/api/shapes` on the server (shape queue is replaced by SSE push)

### API Contract Changes

#### New Endpoint: `GET /api/events?clientId=<uuid>`

- **Response**: SSE stream (Content-Type: `text/event-stream`)
- **Events**:
  - `drawing-snapshot`: Sent on initial connection and after full snapshot updates
    ```
    event: drawing-snapshot
    data: {"snapshot": <TLSnapshot>}
    
    ```
  - `shapes-updated`: Sent when another client posts shape changes
    ```
    event: shapes-updated
    data: {"shapes": [<TLShapePartial>, ...]}
    
    ```

#### Modified Endpoint: `POST /api/shapes`

- **Request body**:
  ```json
  {
    "clientId": "uuid",
    "shapes": [<TLShapePartial>, ...]
  }
  ```
- **Response**: `200 OK` with `{ "broadcast": <count> }` indicating how many clients received the update
- **Side effects**: Broadcasts `shapes-updated` event to all SSE connections except the sender, triggers debounced disk write

#### Existing Endpoint (unchanged): `PUT /api/drawing`

- **Request body**: Full tldraw snapshot
- **Response**: `200 OK` with `{ "version": <number> }`
- **Side effects**: Immediately writes to disk, broadcasts `drawing-snapshot` event to all clients

#### Removed Endpoint: `GET /api/shapes`

- The shape queue mechanism is removed; SSE replaces it entirely

### Data Flow

1. **Client connects**:
   - Client generates `clientId` via `crypto.randomUUID()`
   - Client establishes SSE connection: `GET /api/events?clientId=<uuid>`
   - Server stores connection in map: `sseConnections.set(clientId, response)`
   - Server sends current snapshot from disk via `drawing-snapshot` event

2. **User draws shapes**:
   - Client detects local editor changes
   - Client extracts shape partials
   - Client POSTs to `/api/shapes` with `{ clientId, shapes }`
   - Server merges shapes into in-memory state
   - Server broadcasts `shapes-updated` to all connections except sender
   - Server triggers debounce timer (2s) for disk write

3. **Collaborator receives update**:
   - Collaborator's `EventSource` receives `shapes-updated` event
   - Client parses shape partials and calls `editor.createShapes(partials)`
   - Canvas updates in real-time

4. **Idle period after changes**:
   - 2 seconds after the last shape change
   - Debounce timer fires
   - Server writes merged in-memory state to `drawing.json`

5. **User closes tab**:
   - Browser triggers `beforeunload` event
   - Client sends full snapshot via `PUT /api/drawing` (synchronous fallback)
   - Server immediately writes to disk and broadcasts to other clients

6. **Network disconnection**:
   - Browser's `EventSource` detects disconnect and auto-reconnects after ~3s
   - Server sends full current snapshot via `drawing-snapshot` on reconnect
   - Client loads snapshot to resynchronize

### Validation

- Continue using existing `parseTldrawSnapshot` and `parseShapePartials` validation functions
- Add validation for `clientId` format (UUID v4)
- Return 422 for invalid payloads with descriptive error messages
- Log validation errors on server for debugging

### Compatibility

- `EventSource` is natively supported in all modern browsers (Chrome, Firefox, Safari, Edge)
- No additional client-side dependencies required
- Server-side SSE can be implemented using standard Node.js HTTP response APIs within Vite middleware
- Existing `drawing.json` file format remains unchanged

## Out of Scope

The following features are explicitly deferred to future iterations:

- **WebSocket upgrade**: Bi-directional real-time communication via WebSocket is not needed for this use case
- **Standalone production server**: Migrating from `npx vite` to a dedicated Express or Fastify server
- **Operational Transformation (OT) or CRDT**: Advanced conflict resolution algorithms for complex concurrent editing scenarios
- **Event replay and message queue**: Persisting SSE events for replay after long disconnections
- **Multi-room support**: Isolating multiple canvases with separate sync channels
- **User authentication**: Identifying users beyond anonymous `clientId`
- **Access control**: Restricting who can view or edit specific canvases
- **Production build optimization**: Serving pre-built static assets instead of running Vite dev server
- **Horizontal scaling**: Load balancing SSE connections across multiple server instances
- **Metrics and monitoring**: Tracking SSE connection counts, broadcast latency, or disk write frequency
- **Compression**: Gzip or Brotli compression for SSE streams
- **Binary protocols**: MessagePack, Protocol Buffers, or other efficient serialization formats

## Further Notes

- **Commit messages**: All commit messages must be in English (per user's saved memory preference)
- **User communication**: The user prefers communication in Chinese during development, but technical artifacts (code comments, commit messages, documentation) should be in English
- **Testing recommendations**: Focus testing on SSE connection management (connect, disconnect, broadcast), debounced persistence (timer behavior, file writes), and client-side event handling (snapshot loading, shape creation). Integration tests validating the full end-to-end SSE flow would provide high confidence in the migration.
- **Deployment**: The Dockerfile already runs `npx vite` as the production command, so no deployment changes are needed for SSE support
- **Backward compatibility**: The migration removes polling entirely; there is no backward compatibility mode. All clients must upgrade simultaneously (acceptable for a small deployment)
- **Performance expectations**: For 2-person collaboration, SSE should reduce network requests from ~150/minute (polling) to ~10-30/minute (actual changes only), a ~80-90% reduction in idle traffic
