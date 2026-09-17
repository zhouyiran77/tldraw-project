import { useEffect, useRef } from 'react'
import {
  type Editor,
  type TLRecord,
  type TLShapeId,
  type TLShapePartial,
  loadSnapshot,
} from 'tldraw'
import {
  parseRecordsEvent,
  parseShapesEvent,
  parseSnapshotEvent,
  type DocumentRecordChanges,
  type TLDocumentRecord,
  type TLDocumentRecordId,
} from './tldrawValidation'

const RECORD_BATCH_MS = 100

function createClientId(): string {
  // randomUUID() is only available in secure contexts (HTTPS or localhost).
  // Fall back to formatting random bytes, which works on plain-HTTP origins too.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const clientId = createClientId()

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

function isDocumentRecord(record: TLRecord): record is TLDocumentRecord {
  return (
    record.typeName === 'asset' ||
    record.typeName === 'binding' ||
    record.typeName === 'document' ||
    record.typeName === 'page' ||
    record.typeName === 'shape' ||
    record.typeName === 'user'
  )
}

type DocumentChanges = {
  readonly added: Record<string, TLRecord>
  readonly updated: Record<string, readonly [TLRecord, TLRecord]>
  readonly removed: Record<string, TLRecord>
}

export function collectDocumentChanges(changes: DocumentChanges): DocumentRecordChanges {
  const records: TLDocumentRecord[] = []
  const removedRecordIds: TLDocumentRecordId[] = []

  for (const record of Object.values(changes.added)) {
    if (isDocumentRecord(record)) records.push(record)
  }
  for (const [, record] of Object.values(changes.updated)) {
    if (isDocumentRecord(record)) records.push(record)
  }
  for (const record of Object.values(changes.removed)) {
    if (isDocumentRecord(record)) removedRecordIds.push(record.id)
  }

  return { records, removedRecordIds }
}

export function applyRemoteRecords(
  editor: Editor,
  records: readonly TLDocumentRecord[],
  removedRecordIds: readonly TLDocumentRecordId[] = [],
): void {
  editor.store.mergeRemoteChanges(() => {
    if (records.length > 0) editor.store.put([...records])
    if (removedRecordIds.length > 0) editor.store.remove([...removedRecordIds])
  })
}

export function useFileSync(editor: Editor | null) {
  const recordBusyRef = useRef(false)
  const pendingRecordsRef = useRef(new Map<string, TLDocumentRecord>())
  const pendingRemovedRecordIdsRef = useRef(new Set<TLDocumentRecordId>())
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

    source.addEventListener('document-records', (event) => {
      try {
        const { records, removedRecordIds } = parseRecordsEvent(JSON.parse(event.data) as unknown)
        if (records.length === 0 && removedRecordIds.length === 0) return

        applyRemoteRecords(editor, records, removedRecordIds)
      } catch (error) {
        logSyncError('document records event', error)
      }
    })

    source.onerror = () => console.warn('[sync] SSE connection lost, reconnecting')

    return () => source.close()
  }, [editor])

  useEffect(() => {
    if (!editor) return

    const scheduleFlush = () => {
      if (recordTimerRef.current !== null) {
        clearTimeout(recordTimerRef.current)
      }
      recordTimerRef.current = setTimeout(() => {
        void flushRecords()
      }, RECORD_BATCH_MS)
    }

    const flushRecords = async () => {
      if (pendingRecordsRef.current.size === 0 && pendingRemovedRecordIdsRef.current.size === 0) {
        return
      }
      if (recordBusyRef.current) return

      recordBusyRef.current = true
      const recordsToSend = [...pendingRecordsRef.current.values()]
      const removedRecordIdsToSend = [...pendingRemovedRecordIdsRef.current]
      pendingRecordsRef.current.clear()
      pendingRemovedRecordIdsRef.current.clear()

      try {
        const res = await fetch('/api/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            clientId,
            records: recordsToSend,
            removedRecordIds: removedRecordIdsToSend,
          }),
        })
        await readJson(res)
      } catch (error) {
        logSyncError('post document records', error)
      } finally {
        recordBusyRef.current = false
        if (pendingRecordsRef.current.size > 0 || pendingRemovedRecordIdsRef.current.size > 0) {
          scheduleFlush()
        }
      }
    }

    const unsubscribe = editor.store.listen(
      (entry) => {
        const { records, removedRecordIds } = collectDocumentChanges(entry.changes)
        for (const record of records) {
          pendingRecordsRef.current.set(record.id, record)
          pendingRemovedRecordIdsRef.current.delete(record.id)
        }
        for (const id of removedRecordIds) {
          pendingRecordsRef.current.delete(id)
          pendingRemovedRecordIdsRef.current.add(id)
        }

        if (records.length > 0 || removedRecordIds.length > 0) {
          scheduleFlush()
        }
      },
      { scope: 'document', source: 'user' },
    )

    return () => {
      unsubscribe()
      if (recordTimerRef.current !== null) {
        clearTimeout(recordTimerRef.current)
      }
    }
  }, [editor])

  useEffect(() => {
    const onBeforeUnload = () => {
      if (!editor) return

      try {
        const records = [...pendingRecordsRef.current.values()]
        const removedRecordIds = [...pendingRemovedRecordIdsRef.current]
        if (records.length === 0 && removedRecordIds.length === 0) return

        fetch('/api/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, records, removedRecordIds }),
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
