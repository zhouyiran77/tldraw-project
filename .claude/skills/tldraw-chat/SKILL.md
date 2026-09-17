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

## Shape structure requirements

All shapes sent via `POST /api/shapes` must include these top-level fields for proper rendering:

```json
{
  "id": "shape:unique-id",
  "type": "text",
  "typeName": "shape",
  "parentId": "page:page",
  "index": "a7",
  "x": 400,
  "y": 400,
  "rotation": 0,
  "isLocked": false,
  "opacity": 1,
  "meta": {},
  "props": { }
}
```

**Critical fields:**
- `typeName: "shape"` — Required for tldraw to recognize the record type
- `parentId` — Must reference an existing page (typically `"page:page"`)
- `index` — Fractional index string for Z-order (e.g., `"a7"`, `"a1V"`)
- `rotation`, `isLocked`, `opacity`, `meta` — Must be present even if using default values

**Text shapes:**
- Use `richText` prop (ProseMirror format), not `text`
- Minimum structure: `{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "..."}]}]}`

Shapes missing these fields will be stored but **will not render** in the editor.

## Reference examples (progressive disclosure)

See `reference/` for copy-paste examples, ordered from basic to advanced:

1. `00-required-fields.md` — All required top-level fields and common mistakes
2. `01-minimal-text.md` — Minimal working text shape
3. `02-geo-shapes.md` — Rectangles, ellipses, and other geometric shapes with labels
4. `03-line-shapes.md` — Lines and polylines
5. `04-api-usage.md` — Full HTTP API usage with curl examples
