import { useEffect, useRef } from 'react'
import {
  type Editor,
  type TLRecord,
  type TLShapeId,
  type TLShapePartial,
  getSnapshot,
  loadSnapshot,
} from 'tldraw'
import { parseShapesEvent, parseSnapshotEvent } from './tldrawValidation'

const SHAPE_BATCH_MS = 100

const clientId = crypto.randomUUID()

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

function logSyncError(scope: string, error: unknown): void {
  if (error instanceof Error) {
    console.error(`[sync] ${scope}:`, error)
    return
  }
  throw error
}

export function applyRemoteShapes(
  editor: Editor,
  shapes: readonly TLShapePartial[],
  removedShapeIds: readonly TLShapeId[] = [],
): void {
  const toCreate: TLShapePartial[] = []
  const toUpdate: TLShapePartial[] = []
  for (const shape of shapes) {
    if (shape.id && editor.store.has(shape.id)) {
      toUpdate.push(shape)
    } else {
      toCreate.push(shape)
    }
  }

  editor.store.mergeRemoteChanges(() => {
    if (toCreate.length > 0) editor.createShapes(toCreate)
    if (toUpdate.length > 0) editor.updateShapes(toUpdate)
    if (removedShapeIds.length > 0) editor.deleteShapes([...removedShapeIds])
  })
}

export function useFileSync(editor: Editor | null) {
  const shapeBusyRef = useRef(false)
  const pendingShapesRef = useRef<TLRecord[]>([])
  const pendingRemovedShapeIdsRef = useRef<TLShapeId[]>([])
  const shapeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!editor) return

    const source = new EventSource(`/api/events?clientId=${clientId}`)

    source.addEventListener('drawing-snapshot', (event) => {
      try {
        const snapshot = parseSnapshotEvent(JSON.parse(event.data) as unknown)
        if (!snapshot) return

        editor.store.mergeRemoteChanges(() => {
          loadSnapshot(editor.store, snapshot)
        })
      } catch (error) {
        logSyncError('snapshot event', error)
      }
    })

    source.addEventListener('shapes-updated', (event) => {
      try {
        const { shapes, removedShapeIds } = parseShapesEvent(JSON.parse(event.data) as unknown)
        if (shapes.length === 0 && removedShapeIds.length === 0) return

        applyRemoteShapes(editor, shapes, removedShapeIds)
      } catch (error) {
        logSyncError('shapes event', error)
      }
    })

    source.onerror = () => console.warn('[sync] SSE connection lost, reconnecting')

    return () => source.close()
  }, [editor])

  useEffect(() => {
    if (!editor) return

    const flushShapes = async () => {
      if (
        pendingShapesRef.current.length === 0 &&
        pendingRemovedShapeIdsRef.current.length === 0
      ) {
        return
      }
      if (shapeBusyRef.current) return

      shapeBusyRef.current = true
      const shapesToSend = [...pendingShapesRef.current]
      const removedShapeIdsToSend = [...pendingRemovedShapeIdsRef.current]
      pendingShapesRef.current = []
      pendingRemovedShapeIdsRef.current = []

      try {
        const res = await fetch('/api/shapes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            shapes: shapesToSend,
            removedShapeIds: removedShapeIdsToSend,
          }),
        })
        await readJson(res)
      } catch (error) {
        logSyncError('post shapes', error)
      } finally {
        shapeBusyRef.current = false
      }
    }

    const unsubscribe = editor.store.listen(
      (entry) => {
        for (const record of Object.values(entry.changes.added)) {
          if (record.typeName === 'shape') {
            pendingShapesRef.current.push(record)
          }
        }

        for (const [_from, to] of Object.values(entry.changes.updated)) {
          if (to.typeName === 'shape') {
            pendingShapesRef.current.push(to)
          }
        }

        for (const record of Object.values(entry.changes.removed)) {
          if (record.typeName === 'shape') {
            pendingRemovedShapeIdsRef.current.push(record.id)
          }
        }

        if (
          pendingShapesRef.current.length > 0 ||
          pendingRemovedShapeIdsRef.current.length > 0
        ) {
          if (shapeTimerRef.current !== null) {
            clearTimeout(shapeTimerRef.current)
          }
          shapeTimerRef.current = setTimeout(() => {
            void flushShapes()
          }, SHAPE_BATCH_MS)
        }
      },
      { scope: 'document', source: 'user' },
    )

    return () => {
      unsubscribe()
      if (shapeTimerRef.current !== null) {
        clearTimeout(shapeTimerRef.current)
      }
    }
  }, [editor])

  // beforeunload: flush full snapshot on page close as a safety net
  useEffect(() => {
    const onBeforeUnload = () => {
      if (!editor) return

      try {
        const snapshot = getSnapshot(editor.store)
        fetch('/api/drawing', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshot),
          keepalive: true,
        })
      } catch {
        // best-effort — page is closing
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [editor])
}
