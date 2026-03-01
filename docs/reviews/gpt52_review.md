# GPT-5.2 Review: Architecture & Risk Analysis

**Role:** Architecture Options, Risk Register, Failure Modes, Decision Memo
**Date:** 2026-02-28
**Scope:** Rendering pipeline structural tradeoffs and failure analysis. Line-level code quality (Opus) and external prior art (Gemini) are out of scope.

---

## Executive Summary

The card-news rendering pipeline implements a linear YAML-to-PNG transformation through four well-separated stages (parse, template, block-render, screenshot). The architecture is sound for its current scale (~10 specs, 5-10 slides each), but carries structural risks that would compound under growth: a fixed-delay rendering bottleneck, zero automated verification, and silent failure modes that can produce subtly wrong output without any signal. This review provides three architecture options with a tradeoff matrix, a severity-ranked risk register, a failure mode catalog with blast radius analysis, and a decision memo recommending a phased approach.

---

## Detailed Analysis

### Pipeline Architecture Characterization

The current pipeline is a **synchronous linear chain** with no feedback loops:

```
CLI args → YAML parse → Template compile → [for each slide: block→HTML → Handlebars inject → Puppeteer screenshot] → PNGs
```

Key architectural properties observed from the code:

| Property | Current State | Evidence |
|----------|---------------|----------|
| Execution model | Sequential, single-threaded | `renderer.js:77` — `for (const job of renderJobs)` |
| Error propagation | Fail-fast, no partial output | `render.js:239` — `main().catch()` exits process |
| State management | Stateless per run, no caching | No persistent state between invocations |
| Resource lifecycle | Single browser, single page | `renderer.js:67-68` — one page reused |
| Validation | Structural only, no semantic | `parser.js:76-78` — checks object shape, not content |
| Font loading | Best-effort with silent fallback | `renderer.js:54-56` — timeout catch is empty |

### Architectural Coupling Points

Three coupling points constrain how the pipeline can evolve:

1. **Block renderers produce raw HTML strings** (`blocks/index.js:33-41`). Every block renderer returns an HTML string that is concatenated and injected via Handlebars triple-stache (`{{{blocks_html}}}` in `content.html:17`). This means blocks cannot influence layout decisions, request resources, or signal overflow. The block layer has no channel to communicate back to the orchestrator.

2. **CSS is assembled once and inlined into every slide** (`template-engine.js:58-84`, injected at `base.html:7`). The template engine loads all CSS into `this.stylesCss` during `load()` and embeds the full string in every slide's HTML. Blocks cannot declare their own styles; all styles must exist in the global CSS files. This is simple but means unused block styles are always present, and there is no mechanism for conditional style loading.

3. **Renderer has no contract with content** (`renderer.js:59-96`). The renderer receives `{slideNumber, html}` pairs and screenshots them. It has no knowledge of what blocks are present, what fonts are needed, or what assets are loading. The 3-second fixed wait (`renderer.js:83`) exists precisely because the renderer cannot inspect content readiness.

---

## Architecture Options Matrix

### Option A: Optimized Current Architecture (Incremental)

Retain Handlebars + Puppeteer. Replace fixed delays with event-driven waits. Add validation and logging layers.

| Dimension | Assessment |
|-----------|------------|
| **Rendering speed** | 2-3x improvement (eliminate 3s fixed wait per slide) |
| **Migration cost** | Low. ~2-3 days of targeted changes |
| **Visual fidelity** | Identical to current — same engine |
| **Block extensibility** | Unchanged — still HTML string concatenation |
| **Failure observability** | Improved if logging layer is added |
| **Ceiling** | Sequential Puppeteer remains the fundamental bottleneck; parallelization via multiple pages adds complexity |

Changes required:
- `renderer.js:83` — replace `setTimeout(r, 3000)` with `page.waitForNetworkIdle({idleTime: 500})` + `document.fonts.ready`
- `renderer.js:77` — optionally open N pages for parallel slide rendering
- Add `console.warn()` in silent catch blocks (`renderer.js:54-56`, `template-engine.js:94-96`, `render.js:146-148`)
- Add YAML schema validation in `parser.js` (e.g., using `ajv` or manual checks)

### Option B: Structured Intermediate Representation (IR)

Insert a validation and layout-planning phase between parsing and rendering. Blocks produce a structured IR (not raw HTML) that is validated, measured, and then serialized to HTML.

| Dimension | Assessment |
|-----------|------------|
| **Rendering speed** | Same as Option A (still Puppeteer-based) |
| **Migration cost** | Medium. ~1-2 weeks. Every block renderer changes signature |
| **Visual fidelity** | Identical if HTML output matches |
| **Block extensibility** | Significantly improved — blocks can declare resource needs, estimated height, style dependencies |
| **Failure observability** | Strong — IR can be validated before rendering, catching content overflow or missing assets early |
| **Ceiling** | IR opens the door to alternative renderers (Satori, Canvas) without rewriting blocks |

Changes required:
- Define IR schema: `{ type, html, estimatedHeight?, requiredFonts?, assets? }`
- Each block renderer returns IR object instead of string
- New `layoutPlanner` phase checks total block height against slide viewport, warns on overflow
- Serialization step converts IR to HTML string for Puppeteer

### Option C: React + Satori Pipeline (Rewrite)

Replace Handlebars with React/JSX components and Puppeteer with Satori (SVG) + Resvg (PNG). As documented in the Gemini review's prior art section.

| Dimension | Assessment |
|-----------|------------|
| **Rendering speed** | 10-50x improvement (milliseconds per slide, no browser) |
| **Migration cost** | High. ~2-4 weeks. Complete rewrite of templates, blocks, styles |
| **Visual fidelity** | Different — Satori supports a subset of CSS (flexbox-only, no grid, limited text features). Korean text rendering with Pretendard requires font embedding. [ASSUMPTION: Satori's Korean font support may have edge cases with variable fonts] |
| **Block extensibility** | Excellent — React component model with props/children |
| **Failure observability** | Good — React errors are explicit; no silent rendering failures |
| **Ceiling** | Very high for image generation; poor if animations or complex CSS are needed later |

Changes required:
- New dependency tree: React, Satori, @resvg/resvg-js, plus font file management
- Rewrite all 12 blocks as React components
- Rewrite all 4 templates as React components
- Convert CSS variables to inline style objects or Satori-compatible CSS
- Font loading changes from CDN URLs to local `.woff2` files

### Options Comparison

| Criterion | A: Optimize | B: IR Layer | C: Satori Rewrite |
|-----------|-------------|-------------|-------------------|
| Time to implement | 2-3 days | 1-2 weeks | 2-4 weeks |
| Performance gain | 2-3x | 2-3x | 10-50x |
| Risk of regression | Low | Medium | High |
| Enables future migration | No | Yes | N/A (is the migration) |
| Content validation | Manual additions | Structural | React type-checking |
| Korean typography fidelity | Proven | Proven | [ASSUMPTION: needs verification] |

---

## Risk Register

| ID | Risk | Severity | Likelihood | Impact | Mitigation |
|----|------|----------|------------|--------|------------|
| R1 | **Font renders as fallback without warning** — `renderer.js:54-56` catches font timeout silently. Output PNGs use system sans-serif instead of Pretendard/JetBrains Mono. User discovers the problem only when visually inspecting output. | **HIGH** | Medium | High — every slide in the batch is affected; entire output set may need re-rendering | Add `console.warn()` on font timeout. Optionally, compare `document.fonts.check()` result against expected fonts and exit non-zero if critical fonts missing. |
| R2 | **Content overflow is invisible** — blocks have no height awareness. If YAML content produces blocks taller than the 1350px viewport, Puppeteer clips the bottom silently. The screenshot captures only the visible viewport (`renderer.js:85-88` — no `fullPage: true`). | **HIGH** | High (9-slide spec `topic-compact.yaml` slide 7 has 3 blocks; any content expansion risks overflow) | Medium — individual slides are clipped, but other slides are fine | Option B's IR layer can estimate heights. Short term: add a post-render viewport height check via `page.evaluate(() => document.body.scrollHeight)` and warn if > 1350. |
| R3 | **No automated regression detection** — zero tests mean any change to a block renderer, CSS token, or template can alter visual output without detection. | **HIGH** | High | High — silent visual regressions across all output | Implement snapshot tests for block HTML output. Add visual regression (pixelmatch) for a baseline set of rendered PNGs. |
| R4 | **Puppeteer version drift** — `package.json` pins `^24.0.0`. Major Puppeteer updates frequently change API surface and bundled Chromium behavior. A `npm install` on a new machine could pull a breaking version. | **MEDIUM** | Medium | Medium — build fails or rendering differs | Pin exact version. Add `engines` field. Consider `package-lock.json` in version control. |
| R5 | **Base64 encoding inflates memory for large illustrations** — `template-engine.js:90-93` reads illustration files into memory and base64-encodes them (33% size inflation). A 2MB illustration becomes ~2.7MB of inline HTML per slide. | **MEDIUM** | Low (illustrations are optional and typically small) | Low — single-user CLI, not a server | Add file size check with warning threshold. Consider `file://` protocol URLs for local assets instead of base64. |
| R6 | **`--no-sandbox` Chromium flag** — `renderer.js:20` disables the Chromium sandbox. Safe for local CLI usage. Dangerous if pipeline is ever deployed as a web service or CI job processing untrusted YAML. | **MEDIUM** | Low (currently local-only) | High if exploited — arbitrary code execution in Chromium context | Document the security boundary. Add sandbox when running in non-local environments. |
| R7 | **Slide number collision** — `parser.js:47` sorts slides by number but does not detect duplicates. Two slides with `slide: 3` produce a non-deterministic sort order and overwrite the same output file `03.png`. | **LOW** | Low | Medium — data loss of one slide's output | Add duplicate detection in `normalizeSlides()` with a thrown error or warning. |
| R8 | **YAML deserialization of unexpected types** — `yaml.load()` at `parser.js:74` uses the default schema which is safe in js-yaml v4 (no code execution). However, YAML anchors/aliases can create deeply nested objects consuming memory. | **LOW** | Very low (internal tool, author-controlled YAML) | Low | Document that YAML files should be author-controlled. For defense-in-depth, add `yaml.load(source, { schema: yaml.CORE_SCHEMA })`. |

---

## Failure Mode Analysis

### FM1: Corrupted Visual Output (Silent)

**Trigger:** Font CDN unreachable, or Puppeteer Chromium update changes rendering behavior.
**Mechanism:** `renderer.js:32-57` — `waitForFonts()` catches all errors. `setContent` with `waitUntil: "domcontentloaded"` does not wait for external resources. The 3-second delay may or may not be sufficient.
**Blast radius:** All slides in the batch. Every PNG uses the same page and font loading path.
**Detection:** Manual visual inspection only. No automated check.
**Recovery:** Re-run after fixing font availability. No way to detect which past runs were affected.
**Recommendation:** Add a `--strict` flag that exits non-zero if fonts fail to load. Log font check results to stderr.

### FM2: Content Clipping (Silent)

**Trigger:** YAML spec has too many items in a card-list, or description text is longer than expected.
**Mechanism:** Puppeteer screenshots at fixed 1080x1350 viewport (`renderer.js:68-71`). Content below the fold is not captured. No `fullPage` option is used.
**Blast radius:** Single slide. Other slides in the batch are unaffected.
**Detection:** Manual visual inspection only.
**Recovery:** Author must edit YAML to reduce content, then re-render.
**Recommendation:** Post-screenshot, evaluate `document.body.scrollHeight` vs `this.height`. If scrollHeight exceeds viewport, emit a warning: `"Slide N content overflows viewport by Xpx — content may be clipped."` This is a 5-line change with high diagnostic value.

### FM3: Partial Render on Error (Incomplete Output)

**Trigger:** One block has a typo in `type` field (e.g., `type: cardlist` instead of `card-list`).
**Mechanism:** `blocks/index.js:37-39` throws `Unknown block type`. This propagates through `render.js:170-178` which re-throws with context. `main().catch()` at `render.js:239-241` exits with error. No slides are rendered — even slides before the failing one, because the render loop (`render.js:207-221`) builds all HTML first, then passes to `renderer.renderSlides()`.
**Blast radius:** Entire batch. Zero output even if only 1 of 10 slides has the error.
**Detection:** Explicit — error message with slide number and block index.
**Recovery:** Fix the YAML, re-run.
**Recommendation:** Consider a `--continue-on-error` flag that skips the failing slide and renders the rest. The current fail-fast behavior is actually reasonable for a content authoring tool (you want to know immediately), but a partial-render option would help during iterative development.

### FM4: Output File Overwrite (Data Loss)

**Trigger:** Running `node render.js specs/topic-compact.yaml` twice writes to the same `output/topic-compact/` directory.
**Mechanism:** `renderer.js:64` creates the directory with `{recursive: true}`. `renderer.js:85-88` writes PNGs by slide number. Previous output is silently overwritten.
**Blast radius:** Previous output for that specific spec is lost.
**Detection:** None. No backup, no confirmation prompt.
**Recovery:** None unless user has manual backups or version control on output/.
**Recommendation:** This is acceptable behavior for a development tool. If output preservation matters, add `output/` to `.gitignore` documentation and recommend version control for final assets separately.

### FM5: Puppeteer Launch Failure (Total Failure)

**Trigger:** Chromium binary missing, incompatible system libraries, or `--no-sandbox` failing on certain Linux configurations.
**Mechanism:** `renderer.js:18-21` — `puppeteer.launch()` throws. The error propagates to `main().catch()`.
**Blast radius:** Total — no output produced.
**Detection:** Explicit — Puppeteer error messages are descriptive.
**Recovery:** Install missing dependencies (`apt install` for Chromium libs on Linux). Well-documented Puppeteer troubleshooting path.
**Recommendation:** Add a preflight check or a `--check` CLI flag that verifies Puppeteer can launch before processing YAML.

### FM6: Memory Pressure on Large Batches

**Trigger:** Processing many specs sequentially in a script, or a single spec with many slides containing base64-encoded illustrations.
**Mechanism:** `template-engine.js:86-97` reads illustration files into memory as base64. `renderer.js:67` opens a Chromium page that holds the full HTML (including inlined CSS and base64 assets) in memory. The page is reused but `setContent()` replaces the DOM each time — previous content should be GC'd.
**Blast radius:** Process-level. OOM would kill the entire render.
**Detection:** OS-level (OOM killer) or Node.js heap error.
**Recovery:** Restart the process.
**Recommendation:** LOW risk at current scale. Monitor if illustration usage increases.

---

## Decision Memo

### Recommended Approach: Option A (Optimized Current Architecture), with selective elements of Option B

**Justification:**

1. **The pipeline is fit for purpose at current scale.** 10 specs, 5-10 slides each, run manually by the content author. The architecture's simplicity is a feature, not a deficiency. Adding complexity must clear a high bar.

2. **The highest-value changes are surgical, not structural.** The three most impactful improvements require fewer than 50 lines of code total:
   - Replace `setTimeout(r, 3000)` with `page.waitForNetworkIdle({idleTime: 500})` followed by `document.fonts.ready` (`renderer.js:83`) — eliminates ~70% of render time
   - Add viewport overflow detection after screenshot (`renderer.js:85-88`) — catches the most common silent failure
   - Add `console.warn()` to silent catch blocks (`renderer.js:54-56`, `template-engine.js:94-96`) — makes failures visible

3. **Option B's IR layer is worth adopting selectively.** The full IR refactor is premature, but one element has immediate value: block height estimation for overflow detection. This can be done without changing block renderer signatures by measuring rendered DOM height post-injection.

4. **Option C (Satori) is premature.** The current tool renders ~100 slides total. Puppeteer's 30-second overhead for a 10-slide deck is noticeable but not blocking. The migration cost (2-4 weeks, complete rewrite) is disproportionate, and Korean variable font rendering in Satori is unverified. Revisit if render volume exceeds 500+ slides per run or if the tool becomes a service.

### Implementation Priority

| Priority | Change | Effort | Impact |
|----------|--------|--------|--------|
| P0 | Replace fixed 3s delay with event-driven wait | 1 hour | Render time drops from ~35s to ~10-15s for 10 slides |
| P0 | Add font loading failure warning | 15 min | Eliminates silent font fallback (FM1) |
| P1 | Add viewport overflow detection post-screenshot | 30 min | Catches content clipping (FM2) |
| P1 | Add slide number duplicate detection in parser | 15 min | Prevents data loss (R7) |
| P2 | Add block renderer unit tests (pure functions) | 2-3 hours | Safety net for the 12 block renderers |
| P2 | Pin exact Puppeteer version, commit lockfile | 15 min | Prevents version drift (R4) |
| P3 | Convert `resolveIconUrl` from sync to async | 30 min | Consistency with async pipeline |
| P3 | Add `--strict` and `--continue-on-error` flags | 1-2 hours | Flexible error handling for different workflows |

### What NOT to Do

- Do not add a browser pool or parallel page rendering. The complexity is not warranted for <10 concurrent slides.
- Do not migrate to Satori/React without first verifying Korean variable font rendering produces acceptable results at 2x resolution.
- Do not add a build step, TypeScript, or module bundling. The zero-config CommonJS approach is a strength for this project's scale and audience.

---

## References

- `render.js:136-148` — `resolveIconUrl()` with sync file read and silent error catch
- `render.js:166-178` — `renderBlocks()` with error context wrapping
- `render.js:181-236` — `main()` pipeline orchestration
- `src/parser.js:27-49` — `normalizeSlides()` with sort but no duplicate detection
- `src/parser.js:72-84` — `parseSpec()` YAML loading
- `src/template-engine.js:58-84` — CSS assembly and theme loading
- `src/template-engine.js:86-97` — `resolveIllustration()` with silent failure
- `src/template-engine.js:99-115` — `buildContext()` dual-case field names
- `src/renderer.js:18-21` — Puppeteer launch with `--no-sandbox`
- `src/renderer.js:32-57` — `waitForFonts()` with silent timeout catch
- `src/renderer.js:59-97` — `renderSlides()` sequential loop with fixed 3s delay
- `src/renderer.js:83` — the `setTimeout(r, 3000)` fixed delay
- `src/blocks/index.js:14-27` — frozen block registry
- `src/blocks/index.js:33-41` — `renderBlock()` with unknown-type throw
- `src/blocks/_utils.js:1-8` — `escapeHtml()` XSS prevention
- `templates/base.html:7` — CSS inlined via `{{{styles_css}}}`
- `templates/base.html:11` — hardcoded `@vibe.tip` credit
- `templates/content.html:17` — `{{{blocks_html}}}` raw injection point
- `package.json:12` — `puppeteer: "^24.0.0"` semver range
