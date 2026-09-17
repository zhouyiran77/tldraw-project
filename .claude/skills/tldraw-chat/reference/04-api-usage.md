# API Usage Examples

How to use the HTTP API to manipulate shapes.

## Base URL

```
http://localhost:3003
```

## Endpoints

### GET /api/drawing

Get the complete drawing state including all shapes, pages, and metadata.

```bash
curl http://localhost:3003/api/drawing
```

Returns:
```json
{
  "snapshot": {
    "document": {
      "store": {
        "shape:id1": { /* shape data */ },
        "page:page": { /* page data */ }
      }
    }
  },
  "sessionState": { /* UI state */ }
}
```

### POST /api/shapes

Add, update, or remove shapes.

**Request body:**
```json
{
  "clientId": null,
  "shapes": [/* array of shape objects */],
  "removedShapeIds": [/* array of IDs to remove */]
}
```

**Example: Add a text shape**
```bash
curl -X POST http://localhost:3003/api/shapes \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "clientId": null,
    "shapes": [{
      "id": "shape:text-001",
      "type": "text",
      "typeName": "shape",
      "parentId": "page:page",
      "index": "a1",
      "x": 100,
      "y": 100,
      "rotation": 0,
      "isLocked": false,
      "opacity": 1,
      "meta": {},
      "props": {
        "richText": {
          "type": "doc",
          "content": [{
            "type": "paragraph",
            "content": [{"type": "text", "text": "Hello"}]
          }]
        },
        "color": "black",
        "size": "m",
        "font": "sans",
        "textAlign": "start",
        "autoSize": true,
        "scale": 1
      }
    }],
    "removedShapeIds": []
  }'
```

**Example: Update existing shape**

Send the same shape ID with modified fields:

```bash
curl -X POST http://localhost:3003/api/shapes \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "clientId": null,
    "shapes": [{
      "id": "shape:text-001",
      "type": "text",
      "typeName": "shape",
      "parentId": "page:page",
      "index": "a1",
      "x": 200,
      "y": 200,
      "rotation": 0,
      "isLocked": false,
      "opacity": 1,
      "meta": {},
      "props": {
        "richText": {
          "type": "doc",
          "content": [{
            "type": "paragraph",
            "content": [{"type": "text", "text": "Updated"}]
          }]
        },
        "color": "red",
        "size": "l",
        "font": "sans",
        "textAlign": "start",
        "autoSize": true,
        "scale": 1
      }
    }],
    "removedShapeIds": []
  }'
```

**Example: Remove shapes**
```bash
curl -X POST http://localhost:3003/api/shapes \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "clientId": null,
    "shapes": [],
    "removedShapeIds": ["shape:text-001", "shape:geo-002"]
  }'
```

**Example: Add multiple shapes at once**
```bash
curl -X POST http://localhost:3003/api/shapes \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "clientId": null,
    "shapes": [
      {
        "id": "shape:text-001",
        "type": "text",
        "typeName": "shape",
        "parentId": "page:page",
        "index": "a1",
        "x": 100,
        "y": 100,
        "rotation": 0,
        "isLocked": false,
        "opacity": 1,
        "meta": {},
        "props": {
          "richText": {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "First"}]}]
          },
          "color": "black",
          "size": "m",
          "font": "sans",
          "textAlign": "start",
          "autoSize": true,
          "scale": 1
        }
      },
      {
        "id": "shape:rect-001",
        "type": "geo",
        "typeName": "shape",
        "parentId": "page:page",
        "index": "a2",
        "x": 100,
        "y": 200,
        "rotation": 0,
        "isLocked": false,
        "opacity": 1,
        "meta": {},
        "props": {
          "w": 200,
          "h": 100,
          "geo": "rectangle",
          "color": "blue",
          "fill": "solid",
          "dash": "draw",
          "size": "m",
          "scale": 1
        }
      }
    ],
    "removedShapeIds": []
  }'
```

### POST /api/records

Update complete document records including pages, camera, presence, etc.

**Request body:**
```json
{
  "clientId": null,
  "records": [/* array of tldraw record objects */],
  "removedRecordIds": [/* array of IDs to remove */]
}
```

Use this for page management, camera position, or other non-shape records.

## Response Format

All shape operations return:

```json
{
  "ok": true,
  "broadcast": 2
}
```

- `ok`: Whether the operation succeeded
- `broadcast`: Number of connected clients that received the update

## Error Responses

```json
{
  "ok": false,
  "error": "Shape validation failed: missing required field 'typeName'"
}
```

Common errors:
- Missing required fields (`typeName`, `parentId`, etc.)
- Invalid parent page reference
- Malformed `richText` structure
- Invalid property values for the shape type

## Browser URL

Open the editor in a browser:
```
http://localhost:3003
```

All API changes are immediately reflected in connected browser sessions via Server-Sent Events.
