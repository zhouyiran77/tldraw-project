import type { Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

export default function tldrawSync(): Plugin {
  let filePath: string
  let version = 0
  let lastMtime = 0

  return {
    name: 'tldraw-sync',
    configResolved(config) {
      filePath = path.resolve(config.root, 'drawing.json')
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/api/drawing') return next()

        if (req.method === 'GET') {
          if (fs.existsSync(filePath)) {
            const mtime = fs.statSync(filePath).mtimeMs
            if (mtime !== lastMtime) {
              lastMtime = mtime
              version++
            }
          }

          let snapshot = null
          if (fs.existsSync(filePath)) {
            try {
              snapshot = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
            } catch {
              snapshot = null
            }
          }

          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ version, snapshot }))
          return
        }

        if (req.method === 'PUT') {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8')
            const parsed = JSON.parse(body)
            fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8')
            lastMtime = fs.statSync(filePath).mtimeMs
            version++
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ version }))
          })
          return
        }

        res.statusCode = 405
        res.end()
      })
    },
  }
}
