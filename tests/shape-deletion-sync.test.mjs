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

test('applies incoming shape deletions as remote store changes', () => {
  let isMergingRemoteChanges = false
  const deleted = []
  const editor = {
    store: {
      has: () => false,
      mergeRemoteChanges: (applyChanges) => {
        isMergingRemoteChanges = true
        applyChanges()
        isMergingRemoteChanges = false
      },
    },
    createShapes: () => {},
    updateShapes: () => {},
    deleteShapes: (shapeIds) => {
      assert.equal(isMergingRemoteChanges, true)
      deleted.push(...shapeIds)
    },
  }

  syncModule.applyRemoteShapes(editor, [], ['shape:deleted'])

  assert.deepEqual(deleted, ['shape:deleted'])
})
