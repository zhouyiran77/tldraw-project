import type { ServerResponse } from 'node:http'

export type SseEventName = 'document-records' | 'drawing-snapshot' | 'shapes-updated'

const connections = new Map<string, ServerResponse>()
const connectedAt = new Map<string, number>()

const KEEPALIVE_INTERVAL_MS = 30_000
let keepaliveTimer: ReturnType<typeof setInterval> | null = null

function startKeepalive(): void {
  if (keepaliveTimer !== null) return
  keepaliveTimer = setInterval(() => {
    for (const res of connections.values()) {
      res.write(': keepalive\n\n')
    }
  }, KEEPALIVE_INTERVAL_MS)
}

function stopKeepalive(): void {
  if (keepaliveTimer === null) return
  clearInterval(keepaliveTimer)
  keepaliveTimer = null
}

function format(event: SseEventName, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
}

export function openConnection(clientId: string, res: ServerResponse): void {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  // A deployed reverse proxy buffers the stream indefinitely without this hint.
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  connections.get(clientId)?.end()
  connections.set(clientId, res)
  connectedAt.set(clientId, Date.now())
  startKeepalive()
  console.log(`[tldraw-sse] connected: ${clientId} (${connections.size} active)`)
}

export function closeConnection(clientId: string, res: ServerResponse): void {
  if (connections.get(clientId) !== res) return
  connections.delete(clientId)

  const start = connectedAt.get(clientId)
  connectedAt.delete(clientId)
  const durationSec = start ? ((Date.now() - start) / 1000).toFixed(1) : '?'

  if (connections.size === 0) stopKeepalive()
  console.log(`[tldraw-sse] disconnected: ${clientId} after ${durationSec}s (${connections.size} active)`)
}

export function send(clientId: string, event: SseEventName, payload: unknown): void {
  connections.get(clientId)?.write(format(event, payload))
}

export function broadcast(
  event: SseEventName,
  payload: unknown,
  excludeClientId?: string,
): number {
  const message = format(event, payload)
  let sent = 0

  for (const [clientId, res] of connections) {
    if (clientId === excludeClientId) continue
    res.write(message)
    sent++
  }

  return sent
}
