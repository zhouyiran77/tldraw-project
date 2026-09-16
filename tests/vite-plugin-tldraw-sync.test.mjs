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

test('rejects geo partials that use textAlign before queueing them', async () => {
  // Given
  const fixture = await startServer(createValidSnapshot())
  const invalidGeo = {
    type: 'geo',
    x: 0,
    y: 0,
    props: { geo: 'rectangle', w: 100, h: 100, textAlign: 'middle' },
  }

  try {
    // When
    const response = await fetch(`${fixture.baseUrl}/api/shapes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(invalidGeo),
    })
    const queued = await fetch(`${fixture.baseUrl}/api/shapes`)

    // Then
    assert.equal(response.status, 422)
    assert.deepEqual(await queued.json(), [])
  } finally {
    await fixture.close()
  }
})
