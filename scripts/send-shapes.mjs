#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const origin = process.argv[2] || 'http://localhost:5173'
const file = process.argv[3]

if (!file) {
  console.error('Usage: node scripts/send-shapes.mjs [origin] <json-file>')
  process.exit(1)
}

// ProseMirror rejects text nodes with empty strings.
// Strip them so callers don't need to worry about it.
function sanitizeRichText(node) {
  if (!node || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(sanitizeRichText).filter(Boolean)
  if (node.type === 'text' && node.text === '') return null
  const result = { ...node }
  if (Array.isArray(result.content)) {
    result.content = result.content.map(sanitizeRichText).filter(Boolean)
    if (result.content.length === 0) delete result.content
  }
  return result
}

function sanitizeShape(shape) {
  if (!shape?.props?.richText) return shape
  return { ...shape, props: { ...shape.props, richText: sanitizeRichText(shape.props.richText) } }
}

const shapes = JSON.parse(readFileSync(file, 'utf8'))
const body = JSON.stringify(Array.isArray(shapes) ? shapes.map(sanitizeShape) : sanitizeShape(shapes))

const res = await fetch(`${origin}/api/shapes`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body,
})

const data = await res.json()

if (!res.ok) {
  console.error(`Error ${res.status}:`, JSON.stringify(data))
  process.exit(1)
}

console.log(JSON.stringify(data))
