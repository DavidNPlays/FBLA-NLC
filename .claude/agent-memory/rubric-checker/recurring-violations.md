---
name: recurring-violations
description: Known and recurring rubric violations found across audits of this project
metadata:
  type: project
---

## Violation found in full audit (2026-06-16)

**Help system missing (FAIL — HIGH severity)**
- No user-facing help panel, modal, tooltip set, or instructional guide exists anywhere in the codebase.
- `index.html` has no help button/modal. `ui.js` has no help-related rendering. No `documentation.md` exists.
- The `sign-in-prompt` text inside the business modal is the closest thing ("Sign in with Google to leave a review, save favorites, and claim deals") but this is a conditional UI state hint, not a standalone help system.

**Why this matters:** FBLA rubric item 8 explicitly requires a help system for users.

**How to apply:** Flag as FAIL on every audit until a real help/instructions panel or modal is added to index.html and wired through ui.js.

---

## Things confirmed correct (do not re-flag)

- JSDoc on every function: PASS across all JS files
- File header comments: PASS — all 6 JS files and styles.css and index.html have them
- Descriptive naming: PASS — no single-letter vars or abbreviations found; `db` in storage.js and firebase.js is an acceptable conventional name for a database handle
- No console.log: PASS — none found in any JS file
- Firestore isolation: PASS — only storage.js uses Firestore methods
- Auth isolation: PASS — only auth.js uses Firebase Auth methods
- Dynamic search: PASS — `input` event listener on `#search-input` in ui.js:587 triggers `emitQueryChange` which re-renders without page reload
- All writes check auth: PASS — `requireUser()` called at top of every write function in storage.js
