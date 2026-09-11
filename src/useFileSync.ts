import { useEffect, useRef } from 'react'
import { type Editor, getSnapshot, loadSnapshot } from 'tldraw'

const POLL_MS = 500

export function useFileSync(editor: Editor | null) {
  const versionRef = useRef(-1)
  const lastDocRef = useRef('')
  const busyRef = useRef(false)

  useEffect(() => {
    if (!editor) return

    const tick = async () => {
      if (busyRef.current) return
      busyRef.current = true
      try {
        const res = await fetch('/api/drawing')
        const { version, snapshot } = await res.json()

        if (version !== versionRef.current && snapshot) {
          loadSnapshot(editor.store, snapshot)
          versionRef.current = version
          lastDocRef.current = JSON.stringify(
            getSnapshot(editor.store).document
          )
          return
        }

        if (version !== versionRef.current) {
          versionRef.current = version
        }

        const currentDoc = JSON.stringify(
          getSnapshot(editor.store).document
        )
        if (currentDoc !== lastDocRef.current) {
          const snap = getSnapshot(editor.store)
          const putRes = await fetch('/api/drawing', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snap),
          })
          const data = await putRes.json()
          versionRef.current = data.version
          lastDocRef.current = currentDoc
        }
      } catch {
        // retry next tick
      } finally {
        busyRef.current = false
      }
    }

    const id = setInterval(tick, POLL_MS)
    tick()

    return () => clearInterval(id)
  }, [editor])
}
