---
name: project-architecture
description: Confirmed file responsibilities, module patterns, and naming conventions for Byte-Sized Business Boost
metadata:
  type: project
---

Confirmed architecture as of 2026-06-16 full audit:

- `js/firebase.js` — initializes Firebase app, exposes `window.AppFirebase` with `auth`, `db`, `isConfigured`
- `js/auth.js` — ONLY auth caller; exposes `window.AppAuth` (signInWithGoogle, signOutUser, onAuthChange, getCurrentUser)
- `js/storage.js` — ONLY Firestore accessor; exposes `window.AppStorage`; all writes call `requireUser()` which throws if no user signed in
- `js/data.js` — in-memory catalog, filter/sort logic; `window.AppData`; no Firestore or Auth calls
- `js/ui.js` — all DOM rendering and event binding; `window.AppUI`; no Firestore or Auth calls
- `js/app.js` — controller; wires all modules together; no direct Firestore or Auth calls
- `data/businesses.json` — 18 businesses (not 15-25 range, but acceptable), all have `deal` properties
- `firestore.rules` — blocks unauthenticated writes on all three collections; reviews public read; bookmarks/deals require auth for read too

**Why:** Confirmed correct isolation patterns — storage.js and auth.js boundaries are clean.

**How to apply:** When auditing new features, assume these isolation rules hold unless new Firestore/Auth calls appear outside those files.
