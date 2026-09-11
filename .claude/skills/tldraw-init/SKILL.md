---
name: tldraw-init
description: Set up tldraw with file-backed sync via Vite plugin and polling hook.
user-invocable: true
argument-hint: "[optional: project path]"
---

# tldraw File Sync

**Architecture**:

1. **Vite Plugin**: Middleware that provides HTTP endpoints for JSON file read/write
2. **Polling Sync**: React hook polls file to update editor, and periodically saves editor state to file
3. **Avoid Loops**: Compare JSON strings to detect real changes and prevent infinite updates

Core: Use polling instead of event listeners to keep implementation simple.
