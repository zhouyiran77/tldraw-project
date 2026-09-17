# Required Fields Reference

All shapes must include these top-level fields to render correctly in tldraw.

## Top-Level Required Fields

```json
{
  "id": "shape:unique-id",
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
  "props": { /* shape-specific */ }
}
```

## Field Details

### `id` (string, required)
- Must start with `"shape:"` prefix
- Must be unique across the entire drawing
- Example: `"shape:my-text-001"`

### `type` (string, required)
- Defines the shape type
- Common types: `"text"`, `"geo"`, `"line"`, `"arrow"`, `"draw"`, `"image"`

### `typeName` (string, required)
- Must be `"shape"` for all shapes
- Without this, the shape will not render

### `parentId` (string, required)
- Must reference an existing page ID
- Default page is `"page:page"`
- Shapes without valid parentId will not appear

### `index` (string, required)
- Fractional index for Z-order sorting
- Examples: `"a1"`, `"a2"`, `"a1V"`, `"a5SfBKZV"`
- Lower index = behind, higher = in front
- Use simple values like `"a1"`, `"a2"`, etc. for new shapes

### `x`, `y` (number, required)
- Position on canvas in pixels
- Origin is top-left of the shape's bounding box

### `rotation` (number, required)
- Rotation in radians
- `0` = no rotation
- `Math.PI / 2` = 90° clockwise

### `isLocked` (boolean, required)
- `false` = shape can be selected and edited
- `true` = shape is locked from editing

### `opacity` (number, required)
- Range: `0` to `1`
- `1` = fully opaque, `0` = fully transparent

### `meta` (object, required)
- Custom metadata for your application
- Can be empty: `{}`

### `props` (object, required)
- Shape-specific properties
- Each shape type has different required props
- See individual shape reference docs

## Common Mistakes

❌ **Missing `typeName`**
```json
{
  "id": "shape:text1",
  "type": "text",
  // Missing typeName: "shape"
}
```
Result: Shape stored but **will not render**

❌ **Missing `parentId`**
```json
{
  "id": "shape:text1",
  "type": "text",
  "typeName": "shape",
  // Missing parentId
}
```
Result: Shape has no page association, **will not appear**

❌ **Invalid `parentId`**
```json
{
  "parentId": "page:nonexistent"
}
```
Result: Page doesn't exist, **shape will not appear**

## Minimal Valid Shape

The absolute minimum working shape (as text):

```json
{
  "id": "shape:min1",
  "type": "text",
  "typeName": "shape",
  "parentId": "page:page",
  "index": "a1",
  "x": 0,
  "y": 0,
  "rotation": 0,
  "isLocked": false,
  "opacity": 1,
  "meta": {},
  "props": {
    "richText": {
      "type": "doc",
      "content": [
        { "type": "paragraph", "content": [{ "type": "text", "text": "Hi" }] }
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
