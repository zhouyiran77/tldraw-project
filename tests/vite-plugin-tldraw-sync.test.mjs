import assert from 'node:assert/strict'
import { readFile, rm, writeFile, mkdtemp } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  createShapeId,
  createTLStore,
  defaultBindingUtils,
  defaultShapeUtils,
  toRichText,
} from 'tldraw'
import { createServer as createViteServer } from 'vite'

const projectRoot = process.cwd()
const loader = await createViteServer({
  configFile: false,
  root: projectRoot,
  server: { middlewareMode: true, hmr: false },
})
const pluginModule = await loader.ssrLoadModule('/vite-plugin-tldraw-sync.ts')
await loader.close()

async function startServer(initialSnapshot) {
  const root = await mkdtemp(join(tmpdir(), 'tldraw-sync-test-'))
  const drawingPath = join(root, 'drawing.json')
  const initialContents = JSON.stringify(initialSnapshot, null, 2)
  await writeFile(drawingPath, initialContents, 'utf8')

  const vite = await createViteServer({
    configFile: false,
    root,
    plugins: [pluginModule.default()],
    server: { middlewareMode: true, hmr: false },
  })
  const http = createHttpServer(vite.middlewares)
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve))
  const address = http.address()
  assert.ok(address && typeof address !== 'string')

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    drawingPath,
    initialContents,
    async close() {
      await new Promise((resolve, reject) => {
        http.close((error) => (error ? reject(error) : resolve()))
      })
      await vite.close()
      await rm(root, { recursive: true, force: true })
    },
  }
}

function createValidSnapshot() {
  const store = createTLStore({
    shapeUtils: [...defaultShapeUtils],
    bindingUtils: [...defaultBindingUtils],
  })
  const snapshot = store.getStoreSnapshot()
  const id = createShapeId('validation-test')
  snapshot.store[id] = {
    x: 0,
    y: 0,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
    id,
    type: 'geo',
    props: {
      geo: 'rectangle',
      w: 100,
      h: 100,
      color: 'black',
      fill: 'none',
      dash: 'draw',
      size: 'm',
      labelColor: 'black',
      font: 'draw',
      align: 'middle',
      verticalAlign: 'middle',
      growY: 0,
      url: '',
      scale: 1,
      richText: toRichText(''),
    },
    parentId: 'page:test',
    index: 'a1',
    typeName: 'shape',
  }
  return snapshot
}

function withInvalidGeoAlignment(snapshot) {
  const invalid = structuredClone(snapshot)
  const records = 'document' in invalid ? invalid.document.store : invalid.store
  const geo = Object.values(records).find(
    (record) => record?.typeName === 'shape' && record.type === 'geo',
  )
  assert.ok(geo)
  const align = geo.props.align
  delete geo.props.align
  geo.props.textAlign = align
  return invalid
}

test('rejects a schema-invalid snapshot without overwriting drawing.json', async () => {
  // Given
  const validSnapshot = createValidSnapshot()
  const fixture = await startServer(validSnapshot)

  try {
    // When
    const response = await fetch(`${fixture.baseUrl}/api/drawing`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(withInvalidGeoAlignment(validSnapshot)),
    })

    // Then
    assert.equal(response.status, 422)
    assert.equal(await readFile(fixture.drawingPath, 'utf8'), fixture.initialContents)
  } finally {
    await fixture.close()
  }
})

test('refuses to serve a schema-invalid drawing file', async () => {
  // Given
  const invalidSnapshot = withInvalidGeoAlignment(createValidSnapshot())
  const fixture = await startServer(invalidSnapshot)

  try {
    // When
    const response = await fetch(`${fixture.baseUrl}/api/drawing`)
    const body = await response.json()

    // Then
    assert.equal(response.status, 422)
    assert.match(body.error, /shape\(type = geo\).*align/)
    assert.equal('snapshot' in body, false)
  } finally {
    await fixture.close()
  }
})

test('serves an externally edited drawing file on the next request', async () => {
  // Given
  const initialSnapshot = createValidSnapshot()
  const fixture = await startServer(initialSnapshot)
  const editedSnapshot = structuredClone(initialSnapshot)
  const records = 'document' in editedSnapshot ? editedSnapshot.document.store : editedSnapshot.store
  const geo = Object.values(records).find((record) => record?.typeName === 'shape')
  assert.ok(geo)
  geo.x = 42

  try {
    await writeFile(fixture.drawingPath, JSON.stringify(editedSnapshot, null, 2), 'utf8')

    // When
    const response = await fetch(`${fixture.baseUrl}/api/drawing`)
    const body = await response.json()
    const returnedRecords =
      'document' in body.snapshot ? body.snapshot.document.store : body.snapshot.store

    // Then
    assert.equal(response.status, 200)
    assert.equal(returnedRecords[geo.id].x, 42)
  } finally {
    await fixture.close()
  }
})

test('persists shape deletions from a full snapshot', async () => {
  // Given
  const initialSnapshot = createValidSnapshot()
  const records =
    'document' in initialSnapshot ? initialSnapshot.document.store : initialSnapshot.store
  const shape = Object.values(records).find((record) => record?.typeName === 'shape')
  assert.ok(shape)
  const fixture = await startServer(initialSnapshot)
  const updatedSnapshot = structuredClone(initialSnapshot)
  const updatedRecords =
    'document' in updatedSnapshot ? updatedSnapshot.document.store : updatedSnapshot.store
  delete updatedRecords[shape.id]

  try {
    // When
    const response = await fetch(`${fixture.baseUrl}/api/drawing`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(updatedSnapshot),
    })
    const drawingResponse = await fetch(`${fixture.baseUrl}/api/drawing`)
    const drawing = await drawingResponse.json()
    const storedRecords =
      'document' in drawing.snapshot ? drawing.snapshot.document.store : drawing.snapshot.store

    // Then
    assert.equal(response.status, 200)
    assert.equal(shape.id in storedRecords, false)
  } finally {
    await fixture.close()
  }
})
