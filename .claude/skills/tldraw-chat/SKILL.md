---
name: tldraw-chat
description: Start and collaborate in the local tldraw whiteboard through its validated HTTP sync API. Use when the user wants to chat on a whiteboard, draw on the canvas, inspect the current drawing, or add tldraw shapes.
---

# TLDraw Chat

## Start the session

1. Check whether the Vite development server is already running and capture its origin.
2. If needed, run `npm run dev` in the background and read its output for the actual URL.
3. Request `GET <origin>/api/drawing`. Treat a `200` response as ready; surface any validation error instead of changing the backing file.
4. Give the user the browser URL and ask them to keep the page open while collaborating. The page consumes queued shapes and persists the editor-generated snapshot.

## Canvas boundary

Treat `drawing.json` as application-owned state. Read the canvas through `GET <origin>/api/drawing` and send additions through `POST <origin>/api/shapes`; this keeps every write behind tldraw v5 schema validation.

Do not write, patch, reformat, replace, or generate `drawing.json` with filesystem tools, scripts, redirection, or JSON processors. If an API request is rejected, correct the request instead of bypassing validation.

Do not request `GET /api/shapes`: that endpoint is reserved for the open editor and drains the pending queue.

## Add shapes

Always send shapes through the `scripts/send-shapes.mjs` helper. It reads a JSON file with Node.js (native UTF-8) and posts via `fetch`, bypassing terminal encoding issues that corrupt non-ASCII text on Windows.

Steps:

1. Write the JSON array to `tmp_shapes.json` in the project root using the Write tool.
2. Send via the helper script:

```bash
node scripts/send-shapes.mjs <origin> tmp_shapes.json
```

Shape partial example (the file content):

```json
[
  {
    "type": "geo",
    "x": 120,
    "y": 80,
    "props": {
      "geo": "rectangle",
      "w": 280,
      "h": 120,
      "align": "middle",
      "verticalAlign": "middle",
      "richText": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [{ "type": "text", "text": "Hello" }]
          }
        ]
      }
    }
  }
]
```

Let the editor assign record IDs and fill default properties. For `geo` shapes, horizontal alignment is `align`; `textAlign` belongs to text shapes and is rejected on `geo` shapes.

A successful request returns `200` with `{ "queued": <count> }`. Keep the browser page open, wait for its polling cycle, then verify the persisted result through `GET /api/drawing`.

The shape API currently creates shapes only. For updates or deletions, use the browser editor when available or explain the limitation; never work around it by modifying `drawing.json`.

Keep the user-facing response brief and report API validation failures clearly.
