---
name: project-architecture
description: Core architecture of Byte-Sized Business Boost — module responsibilities and boundary rules
metadata:
  type: project
---

The project uses six plain JS IIFE modules loaded via script tags in dependency order. Each exposes a single global (`window.AppFirebase`, `window.AppData`, `window.AppStorage`, `window.AppAuth`, `window.AppUI`, `window.AppAuth`). No build step; runs directly from index.html.

Module boundaries (strictly enforced by rubric):
- `firebase.js` — initializes Firebase app, exposes `window.AppFirebase.auth` and `window.AppFirebase.db`
- `data.js` — in-memory catalog (fetched from data/businesses.json), filtering, sorting, rating math
- `storage.js` — ONLY file that calls Firestore (`.collection()`, `.doc()`, `.get()`, `.set()`, `.add()`, `.delete()`)
- `auth.js` — ONLY file that calls Firebase Auth (`signInWithPopup`, `signOut`, `onAuthStateChanged`, `GoogleAuthProvider`)
- `ui.js` — all DOM reads/writes; receives handler callbacks from app.js via `init()`; never touches Firestore or Auth
- `app.js` — controller; wires all modules; holds `bookmarkedIds` and `claimedDealIds` state maps; no direct DOM, Firestore, or Auth calls

All write functions in storage.js call `requireUser()` first; all auth guards confirmed present.

**Why:** Rubric-critical single-responsibility rule costs points if violated.
**How to apply:** Flag any Firestore or Auth call found outside its designated file immediately as Critical.
