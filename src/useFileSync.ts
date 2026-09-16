import { useEffect, useRef } from 'react'
import { type Editor, getSnapshot, loadSnapshot } from 'tldraw'
import {
  parseDrawingResponse,
  parseShapePartials,
  parseVersionResponse,
} from './tldrawValidation'

const POLL_MS = 500
const SHAPE_POLL_MS = 300

class SyncRequestError extends Error {
  readonly status: number

  constructor(status: number, detail: string) {
    super(`Drawing sync request failed (${status}): ${detail}`)
    this.name = 'SyncRequestError'
    this.status = status
  }
}

async function readJson(res: Response): Promise<unknown> {
  if (!res.ok) {
    throw new SyncRequestError(res.status, await res.text())
  }
  const value: unknown = await res.json()
  return value
}

export function useFileSync(editor: Editor | null) {
  const versionRef = useRef(-1)
  const lastDocRef = useRef('')
  const busyRef = useRef(false)
  const justLoadedRef = useRef(false)

  useEffect(() => {
    if (!editor) return

    const tick = async () => {
      if (busyRef.current) return
      busyRef.current = true
      try {
        const res = await fetch('/api/drawing')
        const { version, snapshot } = parseDrawingResponse(await readJson(res))

        if (version !== versionRef.current && snapshot) {
          loadSnapshot(editor.store, snapshot)
          versionRef.current = version
          lastDocRef.current = JSON.stringify(getSnapshot(editor.store).document)
          justLoadedRef.current = true
          return
        }

        if (version !== versionRef.current) {
          versionRef.current = version
        }

        if (justLoadedRef.current) {
          justLoadedRef.current = false
          lastDocRef.current = JSON.stringify(getSnapshot(editor.store).document)
          return
        }

        const currentDoc = JSON.stringify(getSnapshot(editor.store).document)
        if (currentDoc !== lastDocRef.current) {
          const snap = getSnapshot(editor.store)
          const putRes = await fetch('/api/drawing', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snap),
          })
          versionRef.current = parseVersionResponse(await readJson(putRes))
          lastDocRef.current = currentDoc
        }
      } catch (error) {
        if (error instanceof Error) {
          console.error('[sync]', error)
          return
        }
        throw error
      } finally {
        busyRef.current = false
      }
    }

    const id = setInterval(tick, POLL_MS)
    tick()
    return () => clearInterval(id)
  }, [editor])

  useEffect(() => {
    if (!editor) return

    const poll = async () => {
      try {
        const res = await fetch('/api/shapes')
        const partials = parseShapePartials(await readJson(res))
        if (partials.length > 0) {
          console.log(`[sync] creating ${partials.length} shapes via editor API`)
          editor.createShapes(partials)
        }
      } catch (error) {
        if (error instanceof Error) {
          console.error('[sync] shape queue error:', error)
          return
        }
        throw error
      }
    }

    const id = setInterval(poll, SHAPE_POLL_MS)
    return () => clearInterval(id)
  }, [editor])
}
