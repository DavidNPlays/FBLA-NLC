---
name: project-security-posture
description: Security posture snapshot for Byte-Sized Business Boost — Firestore rules structure, auth-guard patterns, and known gaps found in initial audit.
metadata:
  type: project
---

## Firestore Rules Structure (firestore.rules)

- **reviews**: public read (`if true`); create gated on `request.auth != null` + `userId == request.auth.uid` + rating 1–5 int + text 1–500 bytes; update/delete permanently blocked (`if false`). Missing: no `businessId` field validation.
- **bookmarks**: read/delete gated on `request.auth != null && resource.data.userId == request.auth.uid`; create/update gated on `request.auth != null && request.resource.data.userId == request.auth.uid`. Missing: doc ID `{uid}_{businessId}` prefix is NOT enforced in rules, so a user can create a bookmark at an arbitrary doc ID as long as the payload `userId` matches their own uid.
- **dealClaims**: same read/create pattern as bookmarks. OVER-PERMISSION: `allow update` granted alongside `allow create` — claimed deals should be immutable. Same missing doc ID enforcement gap.
- **Default deny**: implicit — only named collections have rules; anything else is denied.

## Auth-Guard Pattern in storage.js

All writes use `requireUser()` (defined at line 26–32 of storage.js): calls `window.AppAuth.getCurrentUser()`, throws `Error("You must be signed in to do that.")` if null. Every write (`addReview`, `addBookmark`, `removeBookmark`, `claimDeal`) wraps `requireUser()` in a try/catch and returns `Promise.reject(error)` on failure. This is the canonical pattern to verify on future audits.

## app.js Controller Auth Gating

- `handleToggleBookmark` and `handleClaimDeal`: explicitly check `window.AppAuth.getCurrentUser()` before calling storage — double-gated. PASS.
- `handleSubmitReview` and `handleRemoveFavorite`: NO explicit auth check in app.js — rely solely on `requireUser()` in storage.js. The review form is only rendered when `isSignedIn` is true, and `removeBookmark` can only be triggered from the favorites modal (which only shows bookmarked items for signed-in users), so exploitability is low. Classified MEDIUM.

## Architecture Containment

- Firebase Auth methods (signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider): contained in auth.js only. PASS.
- Firestore `db.collection()` calls: contained in storage.js only. PASS.
- firebase.js: only public config keys, all placeholders. No service account or private credentials. PASS.

## Known Issues From Initial Audit

1. HIGH — firestore.rules:30 — bookmarks `allow create,update` does not verify doc ID prefix matches `request.auth.uid`. A user can write to `{otherUid}_{bizId}` with their own `userId` payload.
2. HIGH — firestore.rules:40 — dealClaims same doc-ID enforcement gap.
3. MEDIUM — firestore.rules:40 — `allow update` on dealClaims is unnecessary; claimed deals should be immutable.
4. MEDIUM — app.js:248 — `handleSubmitReview` lacks an explicit auth check; relies on storage.js guard alone.
5. MEDIUM — app.js:302 — `handleRemoveFavorite` lacks an explicit auth check; relies on storage.js guard alone.
6. LOW — firestore.rules:14-21 — reviews `allow create` does not validate `businessId` field (type or non-empty).
7. LOW — firestore.rules — `text.size()` counts UTF-8 bytes, not Unicode characters; 500-byte limit may truncate multi-byte characters unexpectedly.

**Why:** This is the first security audit of the project. All issues were found in the initial review.
**How to apply:** On re-audit, re-verify the doc-ID enforcement fix was applied in firestore.rules and that the update permission was removed from dealClaims.
