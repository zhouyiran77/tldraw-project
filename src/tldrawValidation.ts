import {
  createTLStore,
  defaultBindingUtils,
  defaultShapeUtils,
  DocumentRecordType,
  isShapeId,
  PageRecordType,
  TLDOCUMENT_ID,
  ZERO_INDEX_KEY,
  loadSnapshot,
  type TLRecord,
  type TLShapeId,
  type TLShapePartial,
} from 'tldraw'

export type TldrawSnapshot = Parameters<typeof loadSnapshot>[1]

export type DrawingResponse = {
  readonly version: number
  readonly snapshot: TldrawSnapshot | null
}

export type ShapeChanges = {
  readonly shapes: TLShapePartial[]
  readonly removedShapeIds: TLShapeId[]
}

export type ShapesPostBody = ShapeChanges & { readonly clientId: string | null }

export type TLDocumentRecord = Extract<
  TLRecord,
  { typeName: 'asset' | 'binding' | 'document' | 'page' | 'shape' | 'user' }
>

export type TLDocumentRecordId = TLDocumentRecord['id']

export type DocumentRecordChanges = {
  readonly records: TLDocumentRecord[]
  readonly removedRecordIds: TLDocumentRecordId[]
}

export type RecordsPostBody = DocumentRecordChanges & {
  readonly clientId: string | null
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class InvalidTldrawPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidTldrawPayloadError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function isSnapshotEnvelope(value: unknown): value is TldrawSnapshot {
  if (!isRecord(value)) return false
  if ('document' in value) return isRecord(value.document)
  return 'store' in value && isRecord(value.store)
}

function isShapePartialEnvelope(value: unknown): value is TLShapePartial {
  return isRecord(value) && typeof value.type === 'string'
}

function isDocumentRecordEnvelope(value: unknown): value is TLDocumentRecord {
  if (!isRecord(value) || typeof value.typeName !== 'string') return false
  if (!['asset', 'binding', 'document', 'page', 'shape', 'user'].includes(value.typeName)) {
    return false
  }
  return typeof value.id === 'string'
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown tldraw validation error'
}

export function parseTldrawSnapshot(value: unknown): TldrawSnapshot {
  if (!isSnapshotEnvelope(value)) {
    throw new InvalidTldrawPayloadError('Expected a tldraw editor or store snapshot')
  }

  const store = createTLStore({
    shapeUtils: [...defaultShapeUtils],
    bindingUtils: [...defaultBindingUtils],
  })

  try {
    loadSnapshot(store, value)
  } catch (error) {
    throw new InvalidTldrawPayloadError(errorDetail(error))
  }

  return value
}

function parseShapePartial(value: unknown): TLShapePartial {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new InvalidTldrawPayloadError('Each shape must be an object with a type')
  }

  const shapeUtil = defaultShapeUtils.find((candidate) => candidate.type === value.type)
  if (!shapeUtil) {
    throw new InvalidTldrawPayloadError(`Unknown tldraw shape type: ${value.type}`)
  }

  if ('props' in value) {
    if (!isRecord(value.props)) {
      throw new InvalidTldrawPayloadError(`Shape ${value.type} props must be an object`)
    }

    for (const [propName, propValue] of Object.entries(value.props)) {
      const validator = Object.entries(shapeUtil.props).find(([name]) => name === propName)?.[1]
      if (!validator) {
        throw new InvalidTldrawPayloadError(
          `Unknown prop "${propName}" for tldraw shape type "${value.type}"`,
        )
      }

      try {
        validator.validate(propValue)
      } catch (error) {
        throw new InvalidTldrawPayloadError(
          `Invalid ${value.type}.${propName}: ${errorDetail(error)}`,
        )
      }
    }
  }

  if (!isShapePartialEnvelope(value)) {
    throw new InvalidTldrawPayloadError('Invalid tldraw shape partial')
  }
  return value
}

export function parseShapePartials(value: unknown): TLShapePartial[] {
  const candidates: readonly unknown[] = isUnknownArray(value) ? value : [value]
  return candidates.map(parseShapePartial)
}

export function parseDocumentRecords(value: unknown): TLDocumentRecord[] {
  if (!isUnknownArray(value)) {
    throw new InvalidTldrawPayloadError('records must be an array of tldraw document records')
  }

  const records = value.map((candidate) => {
    if (!isDocumentRecordEnvelope(candidate)) {
      throw new InvalidTldrawPayloadError('Each record must be a complete document record with a supported typeName')
    }
    return candidate
  })

  const store = createTLStore({
    shapeUtils: [...defaultShapeUtils],
    bindingUtils: [...defaultBindingUtils],
  })

  try {
    store.put(records as TLRecord[])
  } catch (error) {
    throw new InvalidTldrawPayloadError(errorDetail(error))
  }

  return records
}

function parseRemovedShapeIds(value: unknown): TLShapeId[] {
  if (value === undefined) return []
  if (!isUnknownArray(value)) {
    throw new InvalidTldrawPayloadError('removedShapeIds must be an array of shape IDs')
  }

  return value.map((id) => {
    if (typeof id !== 'string' || !isShapeId(id)) {
      throw new InvalidTldrawPayloadError('Each removed shape ID must start with "shape:"')
    }
    return id
  })
}

function parseRemovedRecordIds(value: unknown): TLDocumentRecordId[] {
  if (value === undefined) return []
  if (!isUnknownArray(value)) {
    throw new InvalidTldrawPayloadError('removedRecordIds must be an array of record IDs')
  }

  return value.map((id) => {
    if (typeof id !== 'string' || !/^[^:\s]+:.+$/.test(id)) {
      throw new InvalidTldrawPayloadError('Each removed record ID must contain a type prefix')
    }
    return id as TLDocumentRecordId
  })
}

export function parseDrawingResponse(value: unknown): DrawingResponse {
  if (!isRecord(value) || typeof value.version !== 'number' || !('snapshot' in value)) {
    throw new InvalidTldrawPayloadError('Invalid drawing API response')
  }

  return {
    version: value.version,
    snapshot: value.snapshot === null ? null : parseTldrawSnapshot(value.snapshot),
  }
}

export function parseVersionResponse(value: unknown): number {
  if (!isRecord(value) || typeof value.version !== 'number') {
    throw new InvalidTldrawPayloadError('Invalid drawing version response')
  }
  return value.version
}

export function parseClientId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_V4.test(value)) {
    throw new InvalidTldrawPayloadError('clientId must be a UUID v4 string')
  }
  return value
}

export function parseShapesPostBody(value: unknown): ShapesPostBody {
  if (!isRecord(value)) {
    throw new InvalidTldrawPayloadError('Expected an object with shapes')
  }
  if (!isUnknownArray(value.shapes)) {
    throw new InvalidTldrawPayloadError('shapes must be an array of shape partials')
  }

  const hasClientId = 'clientId' in value && value.clientId != null
  return {
    clientId: hasClientId ? parseClientId(value.clientId) : null,
    shapes: parseShapePartials(value.shapes),
    removedShapeIds: parseRemovedShapeIds(value.removedShapeIds),
  }
}

export function parseRecordsPostBody(value: unknown): RecordsPostBody {
  if (!isRecord(value)) {
    throw new InvalidTldrawPayloadError('Expected an object with records')
  }

  const hasClientId = 'clientId' in value && value.clientId != null
  return {
    clientId: hasClientId ? parseClientId(value.clientId) : null,
    records: parseDocumentRecords(value.records),
    removedRecordIds: parseRemovedRecordIds(value.removedRecordIds),
  }
}

export function parseSnapshotEvent(value: unknown): TldrawSnapshot | null {
  if (!isRecord(value) || !('snapshot' in value)) {
    throw new InvalidTldrawPayloadError('Invalid drawing-snapshot event payload')
  }
  return value.snapshot === null ? null : parseTldrawSnapshot(value.snapshot)
}

export function parseShapesEvent(value: unknown): ShapeChanges {
  if (!isRecord(value) || !isUnknownArray(value.shapes)) {
    throw new InvalidTldrawPayloadError('Invalid shapes-updated event payload')
  }
  return {
    shapes: parseShapePartials(value.shapes),
    removedShapeIds: parseRemovedShapeIds(value.removedShapeIds),
  }
}

export function parseRecordsEvent(value: unknown): DocumentRecordChanges {
  if (!isRecord(value) || !('records' in value)) {
    throw new InvalidTldrawPayloadError('Invalid document-records event payload')
  }

  return {
    records: parseDocumentRecords(value.records),
    removedRecordIds: parseRemovedRecordIds(value.removedRecordIds),
  }
}

export function createEmptySnapshot(): TldrawSnapshot {
  const store = createTLStore({
    shapeUtils: [...defaultShapeUtils],
    bindingUtils: [...defaultBindingUtils],
  })
  store.put([
    DocumentRecordType.create({ id: TLDOCUMENT_ID }),
    PageRecordType.create({
      id: PageRecordType.createId('page'),
      name: 'Page 1',
      index: ZERO_INDEX_KEY,
    }),
  ])
  return store.getStoreSnapshot()
}
