---
name: tldraw-chat
description: Start tldraw with file-backed sync for whiteboard collaboration between user and Claude. Use when user wants to chat on whiteboard, mentions drawing/canvas.
---

# TLDraw Chat

1. Check if dev server running (look for vite process or test port)
2. If not running: `npm run dev` in background
3. Wait 2 seconds, check output for URL
4. Tell user the URL, confirm sync ready
5. Keep response brief

## Collaboration

- User draws in browser → syncs to `drawing.json`
- Claude reads canvas: read `drawing.json`
- Claude adds shapes: edit `drawing.json` with new shape objects
- Use unique IDs like `shape:claude_<timestamp>`