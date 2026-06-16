---
name: project-codebase-structure
description: Confirmed file responsibilities, module namespaces, and function inventory for Byte-Sized Business Boost as of June 2026
metadata:
  type: project
---

This is the FBLA Coding & Programming 2025–2026 project "Byte-Sized Business Boost" — a local-business discovery web app for Lake Forest, Illinois.

## Module Namespaces (window globals)
- `window.AppFirebase` — firebase.js: `{ isConfigured, auth, db }`
- `window.AppData` — data.js: catalog query/filter/sort helpers
- `window.AppStorage` — storage.js: all Firestore reads/writes
- `window.AppAuth` — auth.js: Google Sign-In and auth state
- `window.AppUI` — ui.js: DOM rendering and event wiring
- app.js exposes nothing — it is the top-level controller

## Script load order (index.html)
firebase.js → data.js → storage.js → auth.js → ui.js → app.js

## Firebase SDK version
10.12.0 compat builds from gstatic CDN

## Key data shapes
Business object fields: id, name, category, address, phone, website, description, hours, icon, priceLevel, seedRating { sum, count }, deal { title, code, description }

Firestore collections:
- reviews: { businessId, userId, userName, rating (int 1–5), text (1–2000 chars), createdAt }
- bookmarks: doc id = "{userId}_{businessId}", fields: { userId, businessId, createdAt }
- dealClaims: doc id = "{userId}_{businessId}", fields: { userId, businessId, code, claimedAt }, immutable

## Strict architectural rules
- storage.js is the ONLY file that reads/writes Firestore
- auth.js is the ONLY file that calls Firebase Auth methods
- ui.js never touches Firestore or Auth
- app.js has no direct DOM, Firestore, or Auth calls

## Catalog size
18 businesses, 7 categories, every business has a deal. Seed data in data/businesses.json.

**Why:** Documentation rubric is judge-critical for FBLA; accurate file/function inventory is required.
**How to apply:** Use this to generate function references and verify JSDoc accuracy without re-reading every file from scratch.
