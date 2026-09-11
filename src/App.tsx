import { useState } from 'react'
import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { useFileSync } from './useFileSync'

export default function App() {
  const [editor, setEditor] = useState<Editor | null>(null)
  useFileSync(editor)

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw onMount={setEditor} />
    </div>
  )
}
