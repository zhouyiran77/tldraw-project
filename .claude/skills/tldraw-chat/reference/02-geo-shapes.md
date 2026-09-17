# Geo Shapes (Rectangle, Ellipse, etc.)

Geometric shapes with optional labels.

## Minimal Rectangle

```json
{
  "id": "shape:my-rect-001",
  "type": "geo",
  "typeName": "shape",
  "parentId": "page:page",
  "index": "a2",
  "x": 200,
  "y": 200,
  "rotation": 0,
  "isLocked": false,
  "opacity": 1,
  "meta": {},
  "props": {
    "w": 200,
    "h": 100,
    "geo": "rectangle",
    "color": "black",
    "fill": "none",
    "dash": "draw",
    "size": "m",
    "scale": 1
  }
}
```

## Rectangle with Label

Add `richText`, `font`, `align`, `verticalAlign`, `labelColor` to put text inside:

```json
{
  "props": {
    "w": 200,
    "h": 100,
    "geo": "rectangle",
    "color": "blue",
    "fill": "solid",
    "dash": "draw",
    "size": "m",
    "scale": 1,
    "font": "sans",
    "align": "middle",
    "verticalAlign": "middle",
    "labelColor": "black",
    "growY": 0,
    "url": "",
    "richText": {
      "type": "doc",
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "Label" }]
        }
      ]
    }
  }
}
```

## Geo Types

| `geo` value     | Shape          |
|-----------------|----------------|
| `"rectangle"`   | Rectangle      |
| `"ellipse"`     | Ellipse/Circle |
| `"diamond"`     | Diamond        |
| `"triangle"`    | Triangle       |
| `"star"`        | Star           |
| `"arrow-left"`  | Left arrow     |
| `"arrow-right"` | Right arrow    |
| `"arrow-up"`    | Up arrow       |
| `"arrow-down"`  | Down arrow     |
| `"cloud"`       | Cloud          |
| `"heart"`       | Heart          |
| `"hexagon"`     | Hexagon        |
| `"octagon"`     | Octagon        |
| `"oval"`        | Oval           |
| `"x-box"`       | X box          |
| `"check-box"`   | Check box      |

## Style Options

- `fill`: `"none"`, `"solid"`, `"semi"`, `"pattern"`
- `dash`: `"draw"`, `"solid"`, `"dashed"`, `"dotted"`
- `size`: `"s"`, `"m"`, `"l"`, `"xl"`
- `color`: `"black"`, `"red"`, `"blue"`, `"green"`, `"orange"`, `"yellow"`, `"violet"`, `"light-blue"`, `"light-green"`, `"light-red"`, `"light-violet"`, `"grey"`, `"white"`
