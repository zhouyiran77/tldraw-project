import type { Plugin } from 'vite'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { broadcast, closeConnection, openConnection, send } from './sse-connections.js'
import {
  InvalidTldrawPayloadError,
  createEmptySnapshot,
  parseClientId,
  parseShapesPostBody,
  parseTldrawSnapshot,
  type ShapeChanges,
  type TldrawSnapshot,
} from './src/tldrawValidation.js'

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  return parsed
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

export default function tldrawSync(): Plugin {
  let filePath: string
  let version = 0
  let inMemorySnapshot: TldrawSnapshot | null = null
  let diskWriteTimer: ReturnType<typeof setTimeout> | null = null

  const DEBOUNCE_MS = 2000

  function loadFromDisk(): void {
    try {
      if (!fs.existsSync(filePath)) return
      const content = fs.readFileSync(filePath, 'utf8').trim()
      if (content === '' || content === '{}') return
      inMemorySnapshot = parseTldrawSnapshot(JSON.parse(content) as unknown)
      version++
    } catch (error) {
      if (error instanceof InvalidTldrawPayloadError || error instanceof SyntaxError) {
        console.error('[tldraw-sync] Validation error loading drawing.json:', error.message)
      } else {
        throw error
      }
    }
  }

  function flushToDisk(): void {
    if (!inMemorySnapshot) return
    const start = performance.now()
    const json = JSON.stringify(inMemorySnapshot, null, 2)
    fs.writeFileSync(filePath, json, 'utf8')
    version++
    const elapsed = (performance.now() - start).toFixed(1)
    console.log(`[tldraw-sync] flushed to disk (version ${version}, ${(json.length / 1024).toFixed(1)}kb, ${elapsed}ms)`)
  }

  function scheduleDiskWrite(): void {
    if (diskWriteTimer !== null) clearTimeout(diskWriteTimer)
    diskWriteTimer = setTimeout(() => {
      diskWriteTimer = null
      flushToDisk()
    }, DEBOUNCE_MS)
  }

  function mergeShapeChanges({ shapes, removedShapeIds }: ShapeChanges): void {
    if (inMemorySnapshot === null) {
      inMemorySnapshot = createEmptySnapshot()
    }

    const store = { ...(inMemorySnapshot as Record<string, unknown>) }
    const doc = store.document as Record<string, unknown> | undefined
    const storeRecords = {
      ...((doc?.store ?? store.store) as Record<string, unknown>),
    }

    for (const shape of shapes) {
      const shapeRecord = shape as unknown as Record<string, unknown>
      const id = shapeRecord.id as string | undefined
      if (!id) continue
      const existing = storeRecords[id] as Record<string, unknown> | undefined
      storeRecords[id] = existing ? { ...existing, ...shapeRecord } : shapeRecord
    }

    const removedIds = new Set<string>(removedShapeIds)
    for (const id of removedIds) {
      delete storeRecords[id]
    }
    for (const [id, record] of Object.entries(storeRecords)) {
      const candidate = record as Record<string, unknown>
      if (
        candidate.typeName === 'binding' &&
        (removedIds.has(candidate.fromId as string) || removedIds.has(candidate.toId as string))
      ) {
        delete storeRecords[id]
      }
    }

    if (doc) {
      store.document = { ...doc, store: storeRecords }
    } else {
      store.store = storeRecords
    }
    inMemorySnapshot = store as unknown as TldrawSnapshot
  }

  return {
    name: 'tldraw-sync',
    configResolved(config) {
      filePath = path.resolve(config.root, 'drawing.json')
      loadFromDisk()
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')

        try {
          if (url.pathname === '/api/events') {
            if (req.method !== 'GET') {
              res.statusCode = 405
              res.end()
              return
            }

            const clientId = parseClientId(url.searchParams.get('clientId'))
            openConnection(clientId, res)
            send(clientId, 'drawing-snapshot', { snapshot: inMemorySnapshot })

            req.on('close', () => closeConnection(clientId, res))
            return
          }

          if (url.pathname === '/api/drawing') {
            if (req.method === 'GET') {
              sendJson(res, 200, { version, snapshot: inMemorySnapshot })
              return
            }

            if (req.method === 'PUT') {
              const snapshot = parseTldrawSnapshot(await readJson(req))
              inMemorySnapshot = snapshot
              fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8')
              version++
              broadcast('drawing-snapshot', { snapshot: inMemorySnapshot })
              sendJson(res, 200, { version })
              return
            }

            res.statusCode = 405
            res.end()
            return
          }

          if (url.pathname === '/api/shapes') {
            if (req.method === 'POST') {
              const { clientId, shapes, removedShapeIds } = parseShapesPostBody(await readJson(req))
              mergeShapeChanges({ shapes, removedShapeIds })
              scheduleDiskWrite()
              const recipients = broadcast(
                'shapes-updated',
                { shapes, removedShapeIds },
                clientId ?? undefined,
              )
              console.log(
                `[tldraw-sse] broadcast ${shapes.length} shapes and ${removedShapeIds.length} removals from ${clientId ?? 'external'} to ${recipients} clients`,
              )
              sendJson(res, 200, { broadcast: recipients })
              return
            }

            res.statusCode = 405
            res.end()
            return
          }

          next()
        } catch (error) {
          if (error instanceof SyntaxError) {
            sendJson(res, 400, { error: error.message })
            return
          }
          if (error instanceof InvalidTldrawPayloadError) {
            const clientHint = url.searchParams.get('clientId') ?? 'unknown'
            console.error(`[tldraw-sync] Rejected payload from ${clientHint}: ${error.message}`)
            sendJson(res, 422, { error: error.message })
            return
          }
          next(error)
        }
      })
    },
  }
}
