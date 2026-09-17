# Minimal Text Shape

The simplest working text shape that will render correctly.

## Example

```json
{
  "id": "shape:my-text-001",
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
      "content": [
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "Hello World"
            }
          ]
        }
      ]
    },
    "color": "black",
    "size": "m",
    "font": "sans",
    "textAlign": "start",
    "autoSize": true,
    "scale": 1
  }
}
```

## Key Points

- `richText` uses ProseMirror document format, not plain string
- Minimum structure: `doc` → `paragraph` → `text` node
- `autoSize: true` makes the text box fit content automatically
- `textAlign` options: `"start"`, `"middle"`, `"end"`
- `font` options: `"sans"`, `"serif"`, `"draw"`, `"mono"`
- `size` options: `"s"`, `"m"`, `"l"`, `"xl"`

## API Request

```bash
curl -X POST http://localhost:3003/api/shapes \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "clientId": null,
    "shapes": [/* shape object here */],
    "removedShapeIds": []
  }'
```
