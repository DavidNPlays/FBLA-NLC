---
name: coding-standards
description: Established coding conventions and recurring naming/style patterns in this project
metadata:
  type: project
---

Style conventions confirmed across all files (as of first full audit, 2026-06-16):

- ES5-style `var` throughout (no `let`/`const`, no arrow functions, no destructuring)
- Consistent 2-space indentation, double-quoted strings in JS
- Every file opens with a block comment stating responsibility
- Every function has a JSDoc block with `@param` and `@returns`
- No `console.log` statements in any file
- Descriptive names throughout — spelled-out loop counters (`index`, `first`, `second`)

Recurring naming issue to watch:
- The variable name `data` appears in storage.js and data.js inside `.map()` / `.then()` callbacks as `var data = doc.data()`. The rubric flags vague names like `data`. Future code should use `reviewData` or `docData` instead.
- `results[0]` / `results[1]` positional access in `app.js handleAuthChange` avoids naming the two `Promise.all` result arrays — minor readability concern.

**How to apply:** Flag `data`, `temp`, `val`, `res`, `result` as vague when used as variable names. Accept `index` in loops.
