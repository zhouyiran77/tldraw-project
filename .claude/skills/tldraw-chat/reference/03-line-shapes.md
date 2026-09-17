# Line Shapes

Lines and polylines with configurable points.

## Minimal Two-Point Line

```json
{
  "id": "shape:my-line-001",
  "type": "line",
  "typeName": "shape",
  "parentId": "page:page",
  "index": "a3",
  "x": 100,
  "y": 100,
  "rotation": 0,
  "isLocked": false,
  "opacity": 1,
  "meta": {},
  "props": {
    "dash": "draw",
    "size": "m",
    "color": "black",
    "spline": "line",
    "scale": 1,
    "points": {
      "a1": { "id": "a1", "index": "a1", "x": 0, "y": 0 },
      "a2": { "id": "a2", "index": "a2", "x": 200, "y": 100 }
    }
  }
}
```

## Multi-Point Polyline

Add more entries to `points`. Each point needs a unique `id` and `index`:

```json
{
  "props": {
    "points": {
      "a1": { "id": "a1", "index": "a1", "x": 0, "y": 0 },
      "a2": { "id": "a2", "index": "a2", "x": 100, "y": -50 },
      "a3": { "id": "a3", "index": "a3", "x": 200, "y": 0 },
      "a4": { "id": "a4", "index": "a4", "x": 300, "y": -50 }
    }
  }
}
```

## Spline Types

- `"line"` — straight segments between points
- `"cubic"` — smooth cubic bezier curve through points
