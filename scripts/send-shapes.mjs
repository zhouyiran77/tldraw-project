#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const origin = process.argv[2] || 'http://localhost:5173'
const file = process.argv[3]

if (!file) {
  console.error('Usage: node scripts/send-shapes.mjs [origin] <json-file>')
  process.exit(1)
}

const body = readFileSync(file, 'utf8')

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
