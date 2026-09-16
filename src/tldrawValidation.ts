import {
  createTLStore,
  defaultBindingUtils,
  defaultShapeUtils,
  loadSnapshot,
  type TLShapePartial,
} from 'tldraw'

type TldrawSnapshot = Parameters<typeof loadSnapshot>[1]

export type DrawingResponse = {
  readonly version: number
  readonly snapshot: TldrawSnapshot | null
}

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
