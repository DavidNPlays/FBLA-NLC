# Byte-Sized Business Boost — FBLA 2025–2026

A local business discovery web app built for the FBLA Coding & Programming event.
Helps users find, review, bookmark, and get deals from small local businesses.

## Tech Stack
- HTML, CSS, JavaScript only — no frameworks, no TypeScript, no npm packages
- Firebase (Auth + Firestore) via CDN script tags in index.html
- No build step — app runs by opening index.html directly in a browser
- Firebase Hosting for live deployment (required for Google Sign-In to work)

## Git Workflow
- When asked to "push to github" or similar, automatically: stage all changes,
  write a concise descriptive commit message based on what changed, commit,
  and push to the current branch — without asking for confirmation on the
  message wording.

## Project Structure
- index.html        → app shell and Firebase SDK imports
- css/styles.css    → all styling
- js/app.js         → main controller, initializes everything
- js/auth.js        → Google Sign-In and auth state logic
- js/firebase.js    → Firebase initialization and config
- js/data.js        → business data loading and filtering logic
- js/storage.js     → all Firestore reads and writes (nothing else touches Firestore)
- js/ui.js          → DOM manipulation and rendering
- data/businesses.json → seed data (15–25 pre-loaded businesses)
- documentation.md  → program documentation for FBLA judges

## Coding Rules (Rubric-Critical)
- Every function must have a JSDoc comment above it explaining purpose and return value
- Every file must have a header comment stating its responsibility
- Variable and function names must be descriptive — no single letters, no abbreviations
- No unnecessary complexity — prefer simple, readable solutions over clever ones
- No console.log statements left in final code
- storage.js is the only file allowed to read or write to Firestore
- auth.js is the only file allowed to call Firebase Auth methods

## Data & Auth Rules
- Users can browse and search businesses without signing in
- Users must be signed in via Google to: submit reviews, save bookmarks, or claim deals
- All Firestore writes must check auth state before executing
- Firestore security rules must block unauthenticated writes

## Required Features (FBLA Topic Checklist)
- [ ] Sort/filter businesses by category
- [ ] Leave reviews and star ratings (signed-in users only)
- [ ] Sort businesses by average rating
- [ ] Bookmark/save favorite businesses (signed-in users only)
- [ ] Display deals and coupons per business
- [ ] Bot prevention via Google Sign-In (required before any write action)
- [ ] Export/print favorites list (output report for rubric)
- [ ] Real-time search that updates results as user types

## Git Workflow
- Create a new branch for each feature: feature/[feature-name]
- Commit after every completed and agent-audited feature
- Commit messages must describe what was built, e.g. "add: category filter with real-time update"
- Merge to main only after rubric-checker and code-reviewer agents approve
- Never commit with broken functionality or JS errors

## MCP
- GitHub MCP is connected — use it for all commits, pushes, and branch management

## Sub-Agents (invoke by name)
- rubric-checker    → audit code against FBLA rubric after each feature
- code-reviewer     → check naming, complexity, and style
- documentation-writer → generate/update JSDoc comments and documentation.md
- test-runner       → verify all features work without errors
- firebase-reviewer → audit Firestore security rules and auth logic

## Submission Constraints
- App must run standalone from index.html — no required local server
- Final deliverable: source files zipped and uploaded to Google Drive or OneDrive
- Firebase Hosting URL included in submission instructions
- All data must be free of errors before submission