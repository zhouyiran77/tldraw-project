import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer as createViteServer } from 'vite'

const loader = await createViteServer({
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true, hmr: false },
})
const syncModule = await loader.ssrLoadModule('/src/useFileSync.ts')
await loader.close()

test('loads the file snapshot on the first poll when one exists', () => {
  // Given
  const local = '{"source":"local"}'
  const remote = '{"source":"file"}'

  // When
  const direction = syncModule.chooseSyncDirection(local, remote, null)

  // Then
  assert.equal(direction, 'load')
})

test('saves the canvas when only the local snapshot changed', () => {
  // Given
  const previous = '{"version":1}'
  const local = '{"version":2}'

  // When
  const direction = syncModule.chooseSyncDirection(local, previous, previous)

  // Then
  assert.equal(direction, 'save')
})

test('loads the file when both snapshots changed', () => {
  // Given
  const previous = '{"version":1}'
  const local = '{"version":2,"source":"canvas"}'
  const remote = '{"version":2,"source":"file"}'

  // When
  const direction = syncModule.chooseSyncDirection(local, remote, previous)

  // Then
  assert.equal(direction, 'load')
})

test('does nothing when neither snapshot changed', () => {
  // Given
  const snapshot = '{"version":1}'

  // When
  const direction = syncModule.chooseSyncDirection(snapshot, snapshot, snapshot)

  // Then
  assert.equal(direction, 'idle')
})
