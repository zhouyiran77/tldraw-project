import type { Plugin } from 'vite'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { TLShapePartial } from 'tldraw'
import {
  InvalidTldrawPayloadError,
  parseShapePartials,
  parseTldrawSnapshot,
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

function validationMessage(error: InvalidTldrawPayloadError | SyntaxError): string {
  return error.message
}

export default function tldrawSync(): Plugin {
  let filePath: string
  let version = 0
  let lastMtime: number | null = null
  let cachedSnapshot: ReturnType<typeof parseTldrawSnapshot> | null = null
  let cachedValidationError: string | null = null
  const shapeQueue: TLShapePartial[] = []

  return {
    name: 'tldraw-sync',
    configResolved(config) {
      filePath = path.resolve(config.root, 'drawing.json')
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (req.url === '/api/drawing') {
            if (req.method === 'GET') {
              const mtime = fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : null
              if (mtime !== lastMtime) {
                lastMtime = mtime
                cachedSnapshot = null
                cachedValidationError = null
                version++
                try {
                  if (mtime !== null) {
                    const content = fs.readFileSync(filePath, 'utf8').trim()

                    // Handle empty file or empty object - treat as no snapshot
                    if (content === '' || content === '{}') {
                      cachedSnapshot = null
                    } else {
                      const parsed: unknown = JSON.parse(content)
                      cachedSnapshot = parseTldrawSnapshot(parsed)
                    }
                  }
                } catch (error) {
                  if (
                    error instanceof InvalidTldrawPayloadError ||
                    error instanceof SyntaxError
                  ) {
                    cachedValidationError = validationMessage(error)
                    console.error('[tldraw-sync] Validation error:', cachedValidationError)
                  } else {
                    console.error('[tldraw-sync] Unexpected error:', error)
                    throw error
                  }
                }
              }

              if (cachedValidationError) {
                sendJson(res, 422, { version, error: cachedValidationError })
                return
              }

              sendJson(res, 200, { version, snapshot: cachedSnapshot })
              return
            }

            if (req.method === 'PUT') {
              const snapshot = parseTldrawSnapshot(await readJson(req))
              fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8')
              lastMtime = fs.statSync(filePath).mtimeMs
              cachedSnapshot = snapshot
              cachedValidationError = null
              version++
              sendJson(res, 200, { version })
              return
            }

            res.statusCode = 405
            res.end()
            return
          }

          if (req.url === '/api/shapes') {
            if (req.method === 'GET') {
              sendJson(res, 200, shapeQueue.splice(0))
              return
            }

            if (req.method === 'POST') {
              const shapes = parseShapePartials(await readJson(req))
              shapeQueue.push(...shapes)
              sendJson(res, 200, { queued: shapes.length })
              return
            }

            res.statusCode = 405
            res.end()
            return
          }

          next()
        } catch (error) {
          if (error instanceof SyntaxError) {
            sendJson(res, 400, { error: validationMessage(error) })
            return
          }
          if (error instanceof InvalidTldrawPayloadError) {
            sendJson(res, 422, { error: validationMessage(error) })
            return
          }
          next(error)
        }
      })
    },
  }
}
