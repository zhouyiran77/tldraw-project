import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer as createViteServer } from 'vite'

const loader = await createViteServer({
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true, hmr: false },
})
const syncModule = await loader.ssrLoadModule('/src/useFileSync.ts')
const pluginModule = await loader.ssrLoadModule('/vite-plugin-tldraw-sync.ts')
const validationModule = await loader.ssrLoadModule('/src/tldrawValidation.ts')
await loader.close()

const page = {
  id: 'page:new-page',
  typeName: 'page',
  name: 'New Page',
  index: 'a2',
  meta: {},
}

test('collects page records alongside shapes for document sync', () => {
  const changes = syncModule.collectDocumentChanges({
    added: { [page.id]: page },
    updated: {},
    removed: {},
  })

  assert.deepEqual(changes, {
    records: [page],
    removedRecordIds: [],
  })
})

test('applies a remote page record without changing the local active page', () => {
  let remoteMerge = false
  let currentPageId = 'page:old-page'
  const putRecords = []
  const editor = {
    getCurrentPageId: () => currentPageId,
    store: {
      mergeRemoteChanges: (applyChanges) => {
        remoteMerge = true
        applyChanges()
        remoteMerge = false
      },
      put: (records) => {
        assert.equal(remoteMerge, true)
        putRecords.push(...records)
      },
      remove: () => {},
    },
  }

  syncModule.applyRemoteRecords(editor, [page])

  assert.equal(editor.getCurrentPageId(), 'page:old-page')
  assert.deepEqual(putRecords, [page])
})

test('persists a new page and its shapes under their original page id', () => {
  const snapshot = validationModule.createEmptySnapshot()
  const shape = {
    id: 'shape:on-new-page',
    typeName: 'shape',
    type: 'geo',
    parentId: page.id,
    x: 10,
    y: 20,
    rotation: 0,
    index: 'a1',
    opacity: 1,
    isLocked: false,
    meta: {},
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
      richText: { type: 'doc', content: [{ type: 'paragraph' }] },
    },
  }

  const merged = pluginModule.mergeDocumentRecordChanges(snapshot, {
    records: [page, shape],
    removedRecordIds: [],
  })
  const records = 'document' in merged ? merged.document.store : merged.store

  assert.deepEqual(records[page.id], page)
  assert.equal(records[shape.id].parentId, page.id)
  assert.ok(records['page:page'])
})
