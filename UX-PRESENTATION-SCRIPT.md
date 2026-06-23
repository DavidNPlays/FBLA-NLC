# UX Design — Presentation Script (Local Lift)

**Rubric point this earns:** *"UX design presented, with details about the design rationale, user journey, and accessibility features highlighted."*

**How to use this:** Read it aloud (or paraphrase) while demonstrating the live app at
https://byte-sized-business-lfa.web.app. Bracketed `[stage directions]` tell you what to
click/point at. Hit all three bolded pillars — **Design Rationale**, **User Journey**, and
**Accessibility** — because the rubric names all three. Target length ≈ 2–3 minutes.

Every claim below maps to real code, listed in the **Evidence Map** at the bottom so you can
answer follow-up questions with confidence.

---

## 0. Opening (15 sec)

> "For Local Lift, we didn't just make it work — we designed the *experience*. I'll walk you
> through three things: the **design rationale** behind our choices, the **user journey** from
> landing to a finished report, and the **accessibility features** that make it usable for
> everyone. Let me show you live."

---

## 1. Design Rationale — *why* it looks and behaves this way (45 sec)

> "First, design rationale.
>
> [Point at the page.] "Our whole interface runs on a **design system** — a single set of
> reusable tokens for color, spacing, corners, and shadows. That's why every screen feels
> consistent and was fast to build and change.
>
> "**Color is used to communicate, not just decorate.** We chose a calm lavender-and-blue
> palette for trust, then reserved two accent colors for meaning: **gold is only ever a star
> rating**, and **red is only ever a saved favorite** — a heart. A user always knows what a
> color means.
>
> [Hover a business card.] "We used a **card grid** so each business is a scannable unit —
> photo, name, category, rating, and a one-tap favorite heart. The most important action,
> saving a favorite, is always in the same top-right spot.
>
> [Open a business.] "On the detail page we chose a **full-bleed photo hero** to create
> impact, then a **two-column layout** that puts the facts and map on the left and reviews on
> the right, so reading and deciding happen side by side.
>
> "And it's fully **responsive** — the same design reflows across five breakpoints from wide
> desktop down to small phones, so nothing breaks on any screen."

---

## 2. User Journey — walk the real path (60 sec)

> "Second, the user journey. Let me take the path a real visitor takes.
>
> [Home page.] "You land here and can **browse immediately — no sign-up wall.** Lowering that
> barrier is intentional; discovery should be instant.
>
> [Type in the search box.] "Search is **real-time** — results filter as I type, no submit
> button. I can also **filter by category**, **filter by minimum rating**, and **sort** by
> rating or name. Notice the results count updates and is announced as the list changes.
>
> [Click a card.] "I tap a business and land on its detail page — about, hours, an embedded
> **map**, its **deal**, and **reviews**.
>
> [Click Save / try to review.] "Now the journey branches. To **leave a review, save a
> favorite, or claim a deal**, you sign in with Google. That single sign-in is also our **bot
> prevention** — every write is gated behind a real Google account.
>
> [Go to Favorites.] "Saved hearts collect on the **Favorites page**, which also gives
> **personalized recommendations** based on the categories you favorited.
>
> [Open My Report.] "Finally, the user can **generate a report** — a tabbed view with their
> favorites, rating trends, and a **Compare Businesses** chart — then **download it as a PDF**.
> That's the full journey: land → discover → engage → save → export.
>
> [Optional — open chatbot.] "And if anyone gets stuck, a guided **assistant** is one tap away,
> and we even let users rate that assistant so we can improve it."

---

## 3. Accessibility — highlight it explicitly (45 sec)

> "Third, accessibility — we built this to be usable by everyone, including keyboard and
> screen-reader users.
>
> - "**Semantic structure:** real `header`, `nav`, `main`, `footer`, and headings — so screen
>   readers can navigate by landmark.
> - "**Labels everywhere:** every icon button has an `aria-label`, every input has a label
>   (even visually hidden ones), and decorative emoji are hidden from screen readers.
> - "**Live announcements:** when search results change, a polite live region announces the new
>   count; the same goes for toast messages and chat replies — so non-visual users hear updates.
> - "**Full keyboard support:** every control is reachable by Tab, focused elements show a
>   clear **focus outline**, the star rating is real radio inputs you can use with arrow keys,
>   and **Escape closes dialogs**.
> - "**Dialogs are correct:** our help and rating pop-ups use `role="dialog"`, `aria-modal`,
>   and are labelled.
> - "**Respecting preferences:** we honor the OS **'reduce motion'** setting — if you're
>   sensitive to animation, ours turns off automatically.
> - "**Contrast and tap targets:** text meets contrast guidance and buttons are large enough to
>   tap comfortably.
>
> "Accessibility wasn't an afterthought — it's wired through the markup."

---

## 4. Closing (10 sec)

> "So that's our UX: a consistent design system with purposeful color, a frictionless journey
> from browsing to a downloadable report, and accessibility built in from the markup up.
> Thank you — happy to take questions."

---

## Evidence Map (for judge Q&A — *where each claim lives*)

| Claim | Where to find it |
|---|---|
| Design-system tokens (color, spacing, radius, shadow) | [css/styles.css](css/styles.css) `:root` (lines ~11–53) |
| Gold = ratings only, red heart = favorites only | `--color-gold`, `--color-heart` in [css/styles.css](css/styles.css) |
| Card grid + top-right favorite heart | `buildCardMedia` in [js/ui.js](js/ui.js) (~line 172) |
| Full-bleed hero + two-column detail | `.detail-hero`, `.detail-grid` in [css/styles.css](css/styles.css) (~714, ~1159) |
| Responsive breakpoints (≤1099/900/767/480/400) | media queries in [css/styles.css](css/styles.css) |
| Real-time search (updates as you type) | `searchInput.addEventListener("input", …)` [js/ui.js:925](js/ui.js#L925) |
| Category filter / rating filter / sort | `.controls` in [index.html](index.html#L100); `query()` in [js/data.js](js/data.js) |
| Browse without sign-in; writes gated by Google (bot prevention) | `requireUser()` in [js/storage.js](js/storage.js); [firestore.rules](firestore.rules) |
| Favorites page + recommendations | `recommendBusinesses()` in [js/data.js](js/data.js) (~line 267) |
| Tabbed report + Compare Businesses chart + PDF | `buildFavoritesReportHtml` / `buildRatingTrends` in [js/app.js](js/app.js) |
| Routing: home / `#/business/:id` / `#/favorites` | `handleRoute` in [js/app.js](js/app.js); `showView` in [js/ui.js](js/ui.js) |
| Semantic landmarks (`header`/`nav`/`main`/`footer`) | [index.html](index.html) |
| `aria-label` on icon buttons; `visually-hidden` input labels | [index.html](index.html), [js/ui.js](js/ui.js) |
| Live regions (`aria-live="polite"`, `role="status"`) | results summary [index.html:131](index.html#L131); toast [index.html:307](index.html#L307) |
| Dialog semantics (`role="dialog"`, `aria-modal`, `aria-labelledby`) | help modal [index.html:180](index.html#L180) |
| Star rating = keyboard-usable radio inputs | `role="radiogroup"` / `buildReviewForm` in [js/ui.js](js/ui.js) (~351) |
| Focus outlines (`:focus-visible`) | [css/styles.css:153](css/styles.css#L153) |
| Escape closes dialogs | [js/ui.js:1015](js/ui.js#L1015) |
| Honors reduced-motion preference | `@media (prefers-reduced-motion: reduce)` [css/styles.css:1827](css/styles.css#L1827) |
| Decorative icons hidden from screen readers (`aria-hidden`) | [index.html](index.html), [js/ui.js](js/ui.js) |
