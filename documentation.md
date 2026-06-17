# BizWiz — Program Documentation

**FBLA Coding & Programming 2025–2026**
Lake Forest, Illinois

*(Formerly developed under the working title "Byte-Sized Business Boost.")*

---

## Table of Contents

1. [Project Overview & Purpose](#1-project-overview--purpose)
2. [Feature List](#2-feature-list)
3. [Design System](#3-design-system)
4. [Technology Stack](#4-technology-stack)
5. [Architecture & File Responsibilities](#5-architecture--file-responsibilities)
6. [Data Model](#6-data-model)
7. [Security Model](#7-security-model)
8. [Setup & Configuration](#8-setup--configuration)
9. [How to Run and Deploy](#9-how-to-run-and-deploy)
10. [FBLA Rubric Checklist](#10-fbla-rubric-checklist)
11. [Function Reference](#11-function-reference)

---

## 1. Project Overview & Purpose

**BizWiz** is a local-business discovery web application built for Lake Forest, Illinois. It helps residents and visitors find, explore, review, bookmark, and claim exclusive deals from small local businesses — primarily around the historic Market Square district.

The app was created as an FBLA Coding & Programming project for the 2025–2026 school year. Its goal is to drive community engagement with local commerce by giving businesses a digital presence and giving users the tools to interact with those businesses meaningfully.

### What the app does

- Presents 18 pre-loaded local businesses with details including a photo, address, phone, hours, category, price level, and a description.
- Lets any visitor (signed in or not) search, filter by category, and sort the business listing.
- Requires Google Sign-In before any write action — submitting a review, saving a bookmark, or claiming a deal — which provides bot prevention through Google's own account security and two-step verification.
- Stores reviews, bookmarks, and deal claims in Firebase Firestore with security rules that enforce ownership and data integrity at the server level.
- Lets signed-in users export or print a formatted favorites report for offline reference.

---

## 2. Feature List

Each feature below maps directly to user-facing behavior and to the FBLA topic requirements.

### Real-Time Search

A search field in the hero banner filters the visible business grid as the user types — no submit button is required (the visible "Search" button simply prevents a page reload when pressed or when Enter is hit). The search matches against the business name, category, description, and address simultaneously. An empty search shows all businesses.

**User flow:** Type any keyword (e.g., "coffee", "pizza", "Deerpath") in the hero search field. The grid updates instantly.

### Category Filter

A row of pill-shaped buttons sits in the floating controls bar below the hero, one pill per category plus an "All" pill, generated dynamically from the catalog (sorted A–Z). Tapping a pill narrows the grid to matching businesses and highlights the active pill. The search and category filters work together — both constraints apply at once.

**Categories in the current catalog:** Books & Gifts, Cafes & Bakeries, Fitness, Health & Beauty, Restaurants, Retail & Boutiques, Services.

**User flow:** Tap a category pill (e.g., "Restaurants") in the controls bar. The grid filters immediately and the pill becomes highlighted.

### Sort by Rating

A "Sort" dropdown (unchanged from a dropdown control) sits beside the category pills and provides three options:

| Option | Behavior |
|--------|----------|
| Featured | Default order from `businesses.json` |
| Top rated | Highest average star rating first |
| Name (A–Z) | Alphabetical by business name |

Average ratings combine each business's seed rating (pre-loaded in `businesses.json`) with any user-submitted reviews stored in Firestore. Businesses with more reviews and higher ratings rise to the top when "Top rated" is selected.

**User flow:** Select "Top rated" from the "Sort" dropdown.

### Reviews and Star Ratings

Signed-in users can leave a 1–5 star rating and a written review for any business. Reviews appear in the business detail modal, sorted newest first, and the star rating displayed on both the card and the modal updates immediately after submission.

Reviews cannot be edited or deleted from the client (enforced by Firestore security rules).

**User flow:** Click "View details" on a business card. If signed in, select a star rating, type a review, and click "Post review."

### Bookmarks / Favorites

Signed-in users can bookmark any business by clicking the star (☆) button overlaid on its card photo. Bookmarked businesses show a filled star (★). The favorites count badge in the header updates in real time. Clicking the "Favorites" button opens a modal listing all saved businesses (with thumbnails), where each can be removed individually.

**User flow:** Click ☆ on a card's photo to save it. Click "Favorites" in the header to view the list.

### Deals and Coupons

Every business in the catalog has a deal (title, description, and a redemption code). The deal is shown as a teaser on the business card (🎟️ icon) and in full in the detail modal. Signed-in users click "Claim deal" to reveal the promo code, which they can show in-store. Once claimed, the code remains visible for that user and the claim button disappears.

**User flow:** Open a business detail. Click "Claim deal" (must be signed in). The code is revealed.

### Export and Print Favorites Report

From the Favorites modal, signed-in users can export their saved businesses as a self-contained HTML file (`my-favorite-businesses.html`) or open a browser print dialog. The report is formatted as a table listing business name, category, average rating, address, phone, and current deal. It is stamped with the user's name and a generation timestamp.

**User flow:** Click "Favorites" in the header, then click "Export report" to download or "Print" to open the print dialog.

### Google Sign-In (Bot Prevention / Two-Step Verification)

All write actions (reviews, bookmarks, deal claims) require the user to sign in via Google. The Google Sign-In popup flow enforces Google's own account authentication, including any two-step verification the user has enabled on their Google account. This prevents anonymous bot submissions. Firestore security rules provide a second layer of enforcement at the server.

**User flow:** Click "Sign in with Google" in the header. A Google popup appears. After authenticating, the header shows the user's name and avatar.

### Help Modal

A "? Help" button in the header opens a how-to modal summarizing search, filtering, sorting, viewing details, signing in, reviewing, bookmarking, claiming deals, and exporting/printing — a quick-reference guide for first-time visitors and judges.

**User flow:** Click "? Help" in the header.

---

## 3. Design System

BizWiz follows a single, consistent visual language referred to internally as the **BizWiz design system**. It is implemented entirely in `css/styles.css` using CSS custom properties (design tokens) defined on `:root`.

### Color palette

| Token | Value | Used for |
|-------|-------|----------|
| `--color-dark` | `rgba(0, 0, 0, 0.9)` (near-black) | Top navigation bar, footer, primary buttons |
| `--color-lavender` | `#d1d9f7` | Badges, info-card borders, secondary buttons |
| `--color-periwinkle` | `#6a82d8` | Active/hover filter pills, links, focus outlines |
| `--color-accent-pale` | `#a7b3de` | The italic "Biz" half of the wordmark |
| `--color-gold` | `#ffb400` | Star ratings, review-card borders — reserved exclusively for ratings/reviews |
| `--color-cream-gold` | `#ffedbe` | Rating text displayed over photo heroes |
| `--color-surface` | `#ffffff` | Cards, modals, and the main content area |

The page body sits on a near-white background (`--color-bg: #fffffd`) so that the near-black header and footer bookend a bright white content area, with the hero's blue/lavender gradient (`linear-gradient(135deg, #81a2ff, #e9edf9)`) bridging the two.

### Shape and depth

- **Pill shapes everywhere:** every button, badge, filter, and the sort dropdown uses `--radius-pill: 22px`, giving the whole UI a soft, rounded, consistent silhouette.
- **Card and modal corners:** `--radius-card: 10px` for business cards/photos, `--radius-card-lg: 20px` for modals, info cards, and the floating controls bar.
- **Soft shadows:** a layered shadow scale (`--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-bar`) gives buttons, cards, and modals a sense of depth without harsh borders.
- **Scale-on-hover:** buttons and business cards scale up slightly (`transform: scale(1.05)`) on hover/focus, and scale down slightly on press, giving the interface a tactile, responsive feel.

### Hero gradient

The hero banner (and the photo-fallback tiles described below) use a 135-degree gradient from `#81a2ff` to `#e9edf9` — a blue-to-near-white sweep that ties the hero, card media, and detail-modal photo hero together visually even when no photo is available.

### Responsive breakpoints

The layout adapts at three breakpoints, all implemented as `max-width` media queries in `css/styles.css`:

| Breakpoint | Max width | Key changes |
|------------|-----------|--------------|
| Tablet | `1099px` | Business grid drops from 3 columns to 2; hero padding shrinks; wordmark shrinks slightly |
| Phone | `767px` | Header stacks vertically; controls bar stacks (pills above sort); business grid drops to 1 column; favorites action buttons stretch full width |
| Small phone | `400px` | Hero title and subtitle shrink further; wordmark and button text shrink further |

`prefers-reduced-motion: reduce` is also respected: all animations and transitions are effectively disabled (and cards render fully visible instead of fading/sliding in) for users who request reduced motion.

---

## 4. Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Markup | HTML5 | Single page (`index.html`), semantic elements, ARIA attributes |
| Styling | CSS3 | Custom properties (design tokens), CSS Grid/Flexbox, keyframe animations, the BizWiz design system |
| Logic | Vanilla JavaScript (ES5-compatible) | No frameworks, no build step, no npm |
| Auth | Firebase Authentication (Google provider) | Loaded via CDN compat build |
| Database | Firebase Firestore | Loaded via CDN compat build |
| Hosting | Firebase Hosting | Required for Google Sign-In (must be served over HTTPS) |
| Data | `data/businesses.json` | 18 local businesses, each with a photo URL, loaded at startup via `fetch()` |
| Images | Unsplash (hotlinked via URL) | Each business's `image` field points to an Unsplash photo URL; `images.unsplash.com` is preconnected in `index.html` for faster loading |

**Firebase SDK version:** 10.12.0 (compat builds, loaded from `https://www.gstatic.com/firebasejs/`).

No npm packages, bundlers, transpilers, or frameworks are used. The app runs directly from `index.html` when served over HTTP/HTTPS.

---

## 5. Architecture & File Responsibilities

The app follows a strict single-responsibility module pattern. Each file owns exactly one concern, and inter-module communication flows only through the public namespaces they expose on `window`.

```
index.html
  └─ loads Firebase SDK (CDN), then:
       js/firebase.js   → initializes Firebase, exposes window.AppFirebase
       js/data.js       → loads & queries the business catalog, exposes window.AppData
       js/storage.js    → all Firestore I/O, exposes window.AppStorage
       js/auth.js       → Google Sign-In / auth state, exposes window.AppAuth
       js/ui.js         → DOM rendering & event wiring, exposes window.AppUI
       js/app.js        → controller: wires all modules together
```

### Module Descriptions

**`js/firebase.js`**
Holds the Firebase project configuration and calls `firebase.initializeApp()`. Detects whether real config values have been provided (versus the `REPLACE_WITH_*` placeholders) and only initializes Firebase when they have. Exposes `window.AppFirebase` with `{ isConfigured, auth, db }`. This is the only file that may call `firebase.initializeApp()`.

**`js/data.js`**
Owns the in-memory business catalog. Loads `data/businesses.json` via `fetch()`, provides query functions (filter by category, search by term, sort by rating or name), and computes average ratings by combining seed data with live Firestore review aggregates supplied by the controller. Never reads or writes Firestore.

**`js/storage.js`**
The only file that reads from or writes to Firestore. Manages three collections: `reviews`, `bookmarks`, and `dealClaims`. Every write first verifies a user is signed in (defense-in-depth alongside the security rules). Resolves to empty values when Firebase is unconfigured so the catalog works in browse-only mode.

**`js/auth.js`**
The only file that calls Firebase Auth methods. Signs users in via Google popup, signs them out, exposes the current user, and notifies subscribers when auth state changes. All write-gating in other modules relies on `AppAuth.getCurrentUser()`.

**`js/ui.js`**
Handles all DOM manipulation and rendering. Builds the business card grid (including photo media with a gradient+emoji fallback), the category filter pills, the detail modal (including its photo hero), the favorites modal, the review form, the star display, and the toast notification. Translates user interactions (clicks, form submissions, keyboard events) into calls on handler callbacks provided by `app.js`. Never touches Firestore or Firebase Auth.

**`js/app.js`**
The main controller. Wires all modules together at startup, holds the current session state (which businesses are bookmarked, which deals are claimed, the current search/filter/sort query), and implements every user intent handler. Contains no direct DOM, Firestore, or Firebase Auth calls — it delegates to the dedicated modules.

### Data and Auth flow diagram

```
User interaction
      |
  AppUI (event)
      |
  AppApp (intent handler)
    /   \
AppData  AppStorage ← AppFirebase (db)
           |
         AppAuth ← AppFirebase (auth)
```

---

## 6. Data Model

### `data/businesses.json` — Seed Catalog

The file contains a top-level `"businesses"` array. Each business object has the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier (slug format, e.g. `"market-square-cafe"`) |
| `name` | `string` | Display name of the business |
| `category` | `string` | Business category (e.g. `"Cafes & Bakeries"`) |
| `address` | `string` | Street address in Lake Forest, IL |
| `phone` | `string` | Phone number formatted as `"(847) 234-XXXX"` |
| `website` | `string` | URL (placeholder URLs in current seed data) |
| `description` | `string` | One-to-two sentence description |
| `hours` | `string` | Human-readable hours string |
| `icon` | `string` | Single emoji representing the business type; used as the fallback graphic when a photo is unavailable |
| `priceLevel` | `string` | `"$"`, `"$$"`, or `"$$$"` |
| `seedRating` | `{ sum: number, count: number }` | Pre-loaded rating aggregate (combined with live reviews) |
| `deal` | `{ title: string, code: string, description: string }` | Promotional deal; present on every business in the current catalog |
| `image` | `string` | URL of an Unsplash photo representing the business; shown atop the business card and as the detail-modal hero photo. If the image fails to load, the UI falls back to a gradient tile with the business's `icon` emoji. |

**Current catalog size:** 18 businesses across 7 categories (Books & Gifts, Cafes & Bakeries, Fitness, Health & Beauty, Restaurants, Retail & Boutiques, Services).

### Firestore Collections

#### `reviews`

Stores user-submitted reviews. One document per review submission (auto-generated document ID).

| Field | Type | Description |
|-------|------|-------------|
| `businessId` | `string` | The `id` of the reviewed business |
| `userId` | `string` | Firebase Auth UID of the reviewer |
| `userName` | `string` | Display name of the reviewer at time of submission |
| `rating` | `number` (integer 1–5) | Star rating |
| `text` | `string` | Review body (1–2000 characters, enforced by security rules) |
| `createdAt` | `Timestamp` | Server timestamp set at write time |

#### `bookmarks`

Stores saved businesses per user. Document ID is `"{userId}_{businessId}"` (deterministic, enforced by security rules).

| Field | Type | Description |
|-------|------|-------------|
| `userId` | `string` | Firebase Auth UID of the owner |
| `businessId` | `string` | The `id` of the bookmarked business |
| `createdAt` | `Timestamp` | Server timestamp set at write time |

#### `dealClaims`

Records that a user has claimed a deal. Document ID is `"{userId}_{businessId}"` (deterministic, prevents double-claiming, enforced by security rules). Immutable once created.

| Field | Type | Description |
|-------|------|-------------|
| `userId` | `string` | Firebase Auth UID of the claimer |
| `businessId` | `string` | The `id` of the business whose deal was claimed |
| `code` | `string` | The deal code that was claimed |
| `claimedAt` | `Timestamp` | Server timestamp set at write time |

---

## 7. Security Model

Firestore security rules (`firestore.rules`) implement the following policy:

### Reviews

- **Read:** Public — any client (signed in or not) may read reviews. This allows the catalog to display ratings without requiring authentication.
- **Create:** Signed-in users only. The incoming document must have `userId == request.auth.uid` (users can only create reviews stamped with their own UID), a non-empty `businessId` string, an integer `rating` between 1 and 5, and a non-empty `text` field of no more than 2000 characters.
- **Update / Delete:** Always denied from the client. Reviews are permanent once submitted.

### Bookmarks

- **Read:** Signed-in owners only. A user can only read bookmark documents where `resource.data.userId == request.auth.uid`.
- **Create / Update:** Signed-in owners only. The document ID must equal `{uid}_{businessId}` — this prevents users from writing at arbitrary document paths.
- **Delete:** Signed-in owners only. Users may only delete their own bookmark documents.

### Deal Claims

- **Read:** Signed-in owners only.
- **Create:** Signed-in owners only. Document ID must equal `{uid}_{businessId}`.
- **Update / Delete:** Always denied. A claimed deal cannot be un-claimed or modified from the client.

### Defense-in-Depth

Every write operation in `storage.js` additionally calls `requireUser()` before touching Firestore, which throws immediately if no user is signed in. This provides a client-side check in addition to the server-side Firestore rules, so the application never even attempts a write when the user is unauthenticated.

---

## 8. Setup & Configuration

### Step 1 — Create a Firebase project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com) and create a new project.
2. Enable **Authentication** → Sign-in method → **Google**.
3. Enable **Firestore Database** in production mode.
4. Register a **Web app** under Project settings → Your apps.

### Step 2 — Plug in the Firebase config

Open `js/firebase.js`. The `firebaseConfig` object holds the values from your Firebase project's SDK setup screen (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId). The current build is already connected to the `byte-sized-business-lfa` Firebase project.

If these values are ever reset to placeholders (`REPLACE_WITH_*`), the app falls back to **browse-only mode**: search, filter, and sort work, but sign-in, reviews, bookmarks, and deal claims are disabled (the "Sign in" button shows a setup notice).

### Step 3 — Deploy Firestore security rules

```bash
firebase deploy --only firestore:rules
```

This uploads `firestore.rules` to your project so that the server-side security policy is active.

### Step 4 — Add your hosting domain to Firebase Auth

In the Firebase console, go to **Authentication → Settings → Authorized domains** and add your Firebase Hosting domain (e.g., `your-project-id.web.app`). Google Sign-In will not work from unlisted domains.

---

## 9. How to Run and Deploy

### Important: file:// will not work

The app requires an HTTP or HTTPS origin for two reasons:

1. **`fetch()`** — `data/businesses.json` is loaded via `fetch()`, which browsers block on `file://` origins for security reasons.
2. **Google Sign-In** — Firebase's Google popup flow only works from domains registered in the Firebase console, which are always HTTP/HTTPS.

### Local development (simplest option)

Use any static file server. Examples:

```bash
# Python 3
python3 -m http.server 5500

# Node.js (npx)
npx serve .

# VS Code Live Server extension
# Right-click index.html → "Open with Live Server"
```

Then open `http://localhost:5500` (or whichever port your server uses) in a browser.

Note: Google Sign-In only works from `localhost` if `localhost` is listed as an authorized domain in your Firebase console. It will work; `localhost` is authorized by default.

### Firebase Hosting deployment (production)

```bash
# First time only
npm install -g firebase-tools
firebase login

# Deploy
firebase deploy
```

Firebase Hosting serves the app at `https://your-project-id.web.app`. The Firebase Hosting URL must be added to **Authentication → Settings → Authorized domains** for Google Sign-In to function.

### Submission deliverable

Per FBLA submission requirements: zip the project source files (excluding `node_modules` and `.firebase` if present) and upload to Google Drive or OneDrive. Include the Firebase Hosting URL in the submission so judges can run the live version.

---

## 10. FBLA Rubric Checklist

| Rubric Requirement | Implementation | File(s) |
|--------------------|----------------|---------|
| Sort/filter businesses by category | Category pill buttons filter the grid in real time on click | `js/data.js` (`query`), `js/ui.js` (`populateCategories`, `handleCategoryClick`, `emitQueryChange`), `js/app.js` (`handleQueryChange`) |
| Leave reviews and star ratings (signed-in users only) | Review form in the detail modal; star picker (radio inputs); posts to Firestore `reviews` collection; auth-gated at both client and server | `js/storage.js` (`addReview`), `js/ui.js` (`buildReviewForm`, `bindModalDynamicEvents`), `js/app.js` (`handleSubmitReview`) |
| Sort businesses by average rating | "Top rated" option in the Sort dropdown; averages combine seed data with live Firestore reviews | `js/data.js` (`query`, `getAverageRating`, `getCombinedRating`), `js/app.js` (`refreshReviewStats`) |
| Bookmark/save favorite businesses (signed-in users only) | Star button overlaid on every card's photo; saved to Firestore `bookmarks` collection; auth-gated at both client and server | `js/storage.js` (`addBookmark`, `removeBookmark`), `js/app.js` (`handleToggleBookmark`) |
| Display deals and coupons per business | Deal teaser on every card; full deal with claim button in detail modal; code revealed after claim | `js/ui.js` (`buildCard`, `openBusinessModal`), `js/storage.js` (`claimDeal`), `js/app.js` (`handleClaimDeal`) |
| Bot prevention via Google Sign-In | All write actions require Google Sign-In; Google enforces account security and two-step verification during the popup flow | `js/auth.js` (`signInWithGoogle`), `js/app.js` (`handleSignIn`, auth checks in every intent handler) |
| Export/print favorites list (output report) | "Export report" downloads `my-favorite-businesses.html`; "Print" opens the browser print dialog; report is a formatted HTML table | `js/app.js` (`buildFavoritesReportHtml`, `handleExportFavorites`, `handlePrintFavorites`) |
| Real-time search that updates as user types | Hero search input fires on the `input` event; grid re-renders on every keystroke; matches name, category, description, and address | `js/data.js` (`matchesSearch`, `query`), `js/ui.js` (`emitQueryChange`), `js/app.js` (`handleQueryChange`) |

---

## 11. Function Reference

This section lists every public and private function in each JavaScript module. Functions are listed in the order they appear in the source file.

---

### `js/firebase.js`

**Responsibility:** Firebase initialization and configuration. The only file that calls `firebase.initializeApp()`.

| Function | Purpose | Parameters | Returns |
|----------|---------|------------|---------|
| `initializeFirebase` (IIFE) | Wraps the entire module to avoid polluting the global scope | — | `void` |
| `configHasRealValues(config)` | Detects whether the Firebase config still contains placeholder values | `config` — `Object` | `boolean` |

**Exposed namespace:** `window.AppFirebase` — `{ isConfigured: boolean, auth: Object|null, db: Object|null }`

---

### `js/data.js`

**Responsibility:** Business catalog — loading, searching, filtering, and sorting. Never touches Firestore.

| Function | Purpose | Parameters | Returns |
|----------|---------|------------|---------|
| `defineDataModule` (IIFE) | Wraps the entire module | — | `void` |
| `loadBusinesses()` | Fetches `data/businesses.json` and populates the in-memory catalog | — | `Promise<Array<Object>>` |
| `getAllBusinesses()` | Returns a shallow copy of the full catalog | — | `Array<Object>` |
| `getBusinessById(businessId)` | Looks up a single business by its unique id | `businessId` — `string` | `Object\|null` |
| `getCategories()` | Returns the sorted, de-duplicated list of category names present in the catalog | — | `Array<string>` |
| `setReviewStats(businessId, stats)` | Replaces the live review aggregate for one business (called by the controller after reading Firestore) | `businessId` — `string`, `stats` — `{ sum: number, count: number }` | `void` |
| `getCombinedRating(business)` | Combines a business's seed rating with its live review aggregate | `business` — `Object` | `{ sum: number, count: number }` |
| `getAverageRating(business)` | Returns the average star rating (0 if no ratings exist) | `business` — `Object` | `number` |
| `getRatingCount(business)` | Returns the total number of ratings (seed + live) | `business` — `Object` | `number` |
| `matchesSearch(business, term)` | Tests whether a business matches a lower-cased search term against name, category, description, and address | `business` — `Object`, `term` — `string` | `boolean` |
| `query(options)` | Filters and sorts the catalog according to the provided search term, category, and sort order | `options` — `{ searchTerm?: string, category?: string, sortBy?: string }` | `Array<Object>` |

**Exposed namespace:** `window.AppData`

---

### `js/storage.js`

**Responsibility:** All Firestore reads and writes. The only file that touches Firestore.

| Function | Purpose | Parameters | Returns |
|----------|---------|------------|---------|
| `defineStorageModule` (IIFE) | Wraps the entire module | — | `void` |
| `requireUser()` | Returns the signed-in user or throws if none — used to gate all writes | — | `Object` (Firebase user) or throws `Error` |
| `userBusinessDocId(userId, businessId)` | Builds the deterministic composite document ID (`"{userId}_{businessId}"`) for bookmark and deal-claim records | `userId` — `string`, `businessId` — `string` | `string` |
| `toDate(timestamp)` | Converts a Firestore Timestamp to a JavaScript Date | `timestamp` — `Object\|null` | `Date\|null` |
| `addReview(businessId, rating, text)` | Writes a new review document to the `reviews` collection; requires the user to be signed in | `businessId` — `string`, `rating` — `number`, `text` — `string` | `Promise<Object>` (Firestore doc ref) |
| `getReviewsForBusiness(businessId)` | Reads all reviews for a business and returns them sorted newest first | `businessId` — `string` | `Promise<Array<Object>>` |
| `getReviewStats()` | Reads all reviews and aggregates them into per-business `{ sum, count }` totals | — | `Promise<Object<string, { sum: number, count: number }>>` |
| `addBookmark(businessId)` | Writes a bookmark document to the `bookmarks` collection; requires sign-in | `businessId` — `string` | `Promise<void>` |
| `removeBookmark(businessId)` | Deletes the bookmark document for the signed-in user and business | `businessId` — `string` | `Promise<void>` |
| `getBookmarkIds()` | Returns the list of business IDs bookmarked by the signed-in user | — | `Promise<Array<string>>` |
| `claimDeal(businessId, code)` | Writes a deal-claim document to the `dealClaims` collection; requires sign-in | `businessId` — `string`, `code` — `string` | `Promise<void>` |
| `getClaimedDealIds()` | Returns the list of business IDs whose deals the signed-in user has claimed | — | `Promise<Array<string>>` |

**Exposed namespace:** `window.AppStorage`

---

### `js/auth.js`

**Responsibility:** Google Sign-In and authentication state. The only file that calls Firebase Auth methods.

| Function | Purpose | Parameters | Returns |
|----------|---------|------------|---------|
| `defineAuthModule` (IIFE) | Wraps the entire module | — | `void` |
| `signInWithGoogle()` | Opens the Google Sign-In popup; Google enforces the user's own two-step verification during this flow | — | `Promise<Object>` (Firebase user) |
| `signOutUser()` | Signs the current user out of Firebase Auth | — | `Promise<void>` |
| `onAuthChange(callback)` | Subscribes to Firebase Auth state changes; calls `callback` with the user or null whenever sign-in state changes | `callback` — `Function(Object\|null): void` | `void` |
| `getCurrentUser()` | Returns the currently signed-in Firebase user, or null | — | `Object\|null` |

**Exposed namespace:** `window.AppAuth`

---

### `js/ui.js`

**Responsibility:** All DOM manipulation and rendering, including the BizWiz design system's pill-shaped filters and photo media. Never touches Firestore or Firebase Auth.

| Function | Purpose | Parameters | Returns |
|----------|---------|------------|---------|
| `defineUiModule` (IIFE) | Wraps the entire module | — | `void` |
| `escapeHtml(value)` | Escapes a raw string for safe insertion as HTML text content | `value` — `string` | `string` |
| `formatDate(date)` | Formats a JavaScript Date as a short human-readable string (e.g. "Jun 16, 2026") | `date` — `Date` | `string` |
| `buildStars(rating)` | Builds the HTML for a 5-star visual display with proportional gold fill | `rating` — `number` (0–5) | `string` (HTML) |
| `bindImageFallbacks(root)` | Attaches an `error` listener to every photo within a container so a broken image is replaced by a gradient tile with the business's emoji icon | `root` — `HTMLElement` | `void` |
| `getControlValues()` | Reads the current values of the search input, active category pill, and sort dropdown | — | `{ searchTerm: string, category: string, sortBy: string }` |
| `emitQueryChange()` | Reads control values and calls the `onQueryChange` handler | — | `void` |
| `populateCategories(categories)` | Builds the row of category filter pills (including an "All" pill) inside the controls bar | `categories` — `Array<string>` | `void` |
| `buildCardMedia(business, isBookmarked)` | Builds the photo (or gradient+emoji fallback) and bookmark button shown at the top of a business card | `business` — `Object`, `isBookmarked` — `boolean` | `string` (HTML) |
| `buildCard(business, index, isBookmarked)` | Builds the HTML string for a single business card, including its media, name, category badge, rating, description, deal teaser, and "View details" button | `business` — `Object`, `index` — `number`, `isBookmarked` — `boolean` | `string` (HTML) |
| `renderBusinesses(businesses, bookmarkedIds)` | Renders the full business grid and updates the results summary; re-binds image fallbacks for the new cards | `businesses` — `Array<Object>`, `bookmarkedIds` — `Object<string, boolean>` | `void` |
| `setCardBookmarkState(businessId, isBookmarked)` | Updates a single card's bookmark button in-place without re-rendering the grid | `businessId` — `string`, `isBookmarked` — `boolean` | `void` |
| `buildReviewsHtml(reviews)` | Builds the HTML for the review list shown in the detail modal | `reviews` — `Array<Object>` | `string` (HTML) |
| `buildReviewForm(isSignedIn)` | Builds the review submission form (signed-in users) or a sign-in prompt (signed-out users) | `isSignedIn` — `boolean` | `string` (HTML) |
| `buildDetailHero(business, average, count)` | Builds the photo hero (or gradient+emoji fallback) shown at the top of the detail modal, including the category badge, business name, and rating overlay | `business` — `Object`, `average` — `number`, `count` — `number` | `string` (HTML) |
| `openBusinessModal(business, state)` | Renders and opens the business detail modal with its photo hero, info, deal, and reviews | `business` — `Object`, `state` — `{ reviews: Array, isSignedIn: boolean, isDealClaimed: boolean }` | `void` |
| `bindModalDynamicEvents(business)` | Wires the claim-deal button and review form submit handler inside the open modal | `business` — `Object` | `void` |
| `renderModalReviews(reviews)` | Replaces the reviews list inside the open modal and resets the review form | `reviews` — `Array<Object>` | `void` |
| `revealDealCode()` | Makes the deal code visible and removes the "Claim deal" button in the open modal | — | `void` |
| `openFavoritesModal(favorites)` | Renders and opens the favorites modal with the user's bookmarked businesses, including thumbnail photos | `favorites` — `Array<Object>` | `void` |
| `updateFavoritesCount(count)` | Updates the favorites count badge in the header; hides the badge when count is 0 | `count` — `number` | `void` |
| `updateAuthState(user)` | Switches the header between the sign-in button and the signed-in user chip | `user` — `Object\|null` | `void` |
| `showToast(message, type)` | Displays a transient toast notification; auto-hides after 2.8 seconds | `message` — `string`, `type` — `string` (optional, `"error"`) | `void` |
| `openModal(modal)` | Shows a modal element and locks page scrolling | `modal` — `HTMLElement` | `void` |
| `closeModals()` | Hides all modals and restores page scrolling | — | `void` |
| `handleCategoryClick(event)` | Handles a click on a category filter pill: updates the active category, toggles the pressed/active pill styling, and triggers a query change | `event` — `Event` | `void` |
| `init(providedHandlers)` | Caches DOM element references and binds all static event listeners (search, sort, category pills, auth, favorites, help, modals); must be called once at startup | `providedHandlers` — `Object<string, Function>` | `void` |

**Exposed namespace:** `window.AppUI`

---

### `js/app.js`

**Responsibility:** Main application controller. Wires all modules together, holds session state, and implements every user intent handler.

| Function | Purpose | Parameters | Returns |
|----------|---------|------------|---------|
| `defineAppController` (IIFE) | Wraps the entire module | — | `void` |
| `countKeys(map)` | Counts the number of own keys in a plain object | `map` — `Object` | `number` |
| `refreshResults()` | Re-runs the current query through `AppData` and re-renders the grid via `AppUI` | — | `void` |
| `refreshReviewStats()` | Fetches review aggregates from Firestore and pushes them into `AppData` so average ratings stay current | — | `Promise<void>` |
| `updateFavoritesCount()` | Updates the favorites count badge by counting current bookmarked IDs | — | `void` |
| `getFavoriteBusinesses()` | Builds and returns the array of bookmarked business objects from the in-memory bookmark map | — | `Array<Object>` |
| `buildFavoritesReportHtml(favorites)` | Builds a complete, self-contained HTML document listing the user's favorited businesses; used by both export and print | `favorites` — `Array<Object>` | `string` (HTML document) |
| `escapeForReport(value)` | HTML-escapes text for safe inclusion in the generated report | `value` — `string` | `string` |
| `handleQueryChange(values)` | Stores the new query values and triggers a grid refresh | `values` — `{ searchTerm: string, category: string, sortBy: string }` | `void` |
| `handleOpenBusiness(businessId)` | Loads reviews for the business from Firestore, then opens the detail modal | `businessId` — `string` | `void` |
| `showBusinessWithReviews(reviews)` | Inner helper that calls `AppUI.openBusinessModal` with the loaded reviews | `reviews` — `Array<Object>` | `void` |
| `handleToggleBookmark(businessId)` | Adds or removes a bookmark in Firestore and updates the in-memory map and card UI; requires sign-in | `businessId` — `string` | `void` |
| `handleClaimDeal(business)` | Writes a deal claim to Firestore and reveals the code in the modal; requires sign-in | `business` — `Object` | `void` |
| `handleSubmitReview(business, rating, text)` | Writes a review to Firestore, refreshes the modal reviews, updates aggregates, and re-renders the grid; requires sign-in | `business` — `Object`, `rating` — `number`, `text` — `string` | `void` |
| `handleSignIn()` | Starts the Google Sign-In popup flow via `AppAuth`; shows an error toast if Firebase is not configured | — | `void` |
| `handleSignOut()` | Signs the current user out via `AppAuth` | — | `void` |
| `handleOpenFavorites()` | Opens the favorites modal with the current bookmarked businesses | — | `void` |
| `handleRemoveFavorite(businessId)` | Removes a bookmark from Firestore, updates the in-memory map, and refreshes the favorites modal | `businessId` — `string` | `void` |
| `handleExportFavorites()` | Generates the HTML report and triggers a browser download of `my-favorite-businesses.html` | — | `void` |
| `handlePrintFavorites()` | Opens a new browser window with the HTML report and triggers the print dialog | — | `void` |
| `handleAuthChange(user)` | Responds to sign-in state changes by updating the header UI and reloading the user's bookmarks and deal claims from Firestore | `user` — `Object\|null` | `void` |
| `startApp()` | Initializes the entire application: wires UI handlers, loads the business catalog, fetches review stats, renders the grid, and starts listening for auth state changes | — | `void` |

**No exposed namespace.** `app.js` is the top-level controller and exposes nothing on `window`; all coordination happens through the other modules' namespaces.

---

*Documentation generated for FBLA Coding & Programming 2025–2026. BizWiz — Lake Forest, Illinois.*
