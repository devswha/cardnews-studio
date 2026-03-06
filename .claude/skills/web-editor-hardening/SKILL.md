---
name: web-editor-hardening
description: Harden a browser-based editor in this repo by adding pre-save validation, toast-style status UX, and Puppeteer E2E coverage. Use when public/ + server.js flows feel fragile or under-tested.
---

# Web Editor Hardening

## Use when
- A browser editor/admin UI in this repo needs safer save/render flows
- `public/*.js` UX feedback is still using blocking alerts or weak status text
- You need regression coverage for search, preview, validation, or save/render behavior
- You want logic shared by browser code and Node tests via small UMD helpers in `public/`

## Workflow
1. **Map the editor surface**
   - Main files are usually `public/index.html`, `public/styles.css`, `public/app.js`, `public/*-helpers.js`, and `server.js`
   - For E2E, prefer `createApp()` from `server.js` with an ephemeral port

2. **Extract reusable logic first**
   - Put testable browser+Node helpers in `public/*.js` UMD files
   - Good fits: validation, spec filtering, preview URL generation, default object builders

3. **Add save-time validation**
   - Validate `state.toJSON()` before save/render
   - Show a persistent inline summary for actionable issues
   - If possible, mirror the guard in `server.js` so invalid payloads are rejected server-side too

4. **Prefer toast UX over alerts**
   - Keep `confirm()` only for destructive navigation
   - Use transient toasts for save/render/info/error feedback
   - Keep longer-lived status text or panels for context-specific detail

5. **Add Puppeteer E2E coverage**
   - Follow existing `node:test` + `puppeteer` patterns in `test/`
   - One behavior per test
   - Recommended first cases:
     - spec search + existing preview auto-load
     - validation failure surfaces in UI and blocks save
     - focus preservation across rerenders

6. **Verify before finishing**
   - `node --check` on touched browser/server files
   - `npm test`
   - One manual screenshot smoke if UI changed materially

## Repo-specific guardrails
- Do not use fixed ports in tests; start `createApp()` on port `0`
- Do not mutate real spec files in tests unless the test guarantees failure before write
- Avoid over-validating fields that the renderer intentionally defaults
- Keep UI helpers small and testable instead of growing `public/app.js` indefinitely
