Review and QA rendered card news: $ARGUMENTS

Parse arguments: first arg is spec name or path, `--fix` enables auto-fix mode, `--slide N` reviews only slide N.

## Overview

Perform content and visual quality assurance on rendered card news. Checks YAML spec validity, content quality, and rendered PNG output. Optionally auto-fixes issues and re-renders affected slides.

## Usage

```
/review-card topic-awesome-claude-skills
/review-card specs/topic-tailscale.yaml --fix
/review-card topic-omc --slide 3
/review-card topic-vscode --fix --slide 4
```

## Output

```
Review report (printed to console)
specs/topic-{slug}.yaml     # Updated spec (if --fix)
output/topic-{slug}/*.png   # Re-rendered slides (if --fix)
```

## Execution Protocol

### Phase 1: Load Assets

1. Resolve spec path (bare name → `specs/topic-{name}.yaml`)
2. Load and parse YAML spec
3. Identify source thread from `meta.source_file` — read it for content comparison
4. List rendered PNGs in `output/topic-{slug}/`
5. If `--slide N`: scope review to that slide only

### Phase 2: Content Review

Check the YAML spec for structural and content issues:

**Structural checks:**
- [ ] `total_slides` matches actual slide count in `slides` array
- [ ] Every slide has required fields: `slide`, `layout`, `title`, `blocks`
- [ ] Slide numbers are sequential (1, 2, 3, ...)
- [ ] First slide is `cover` layout with `blocks: []`
- [ ] Last slide is `closing` layout
- [ ] No slide has more than 3 blocks
- [ ] card-list items: 2-3 per block
- [ ] step-list items: ≤4 per block

**Content checks:**
- [ ] All `highlight_word` values are exact substrings of their parent text fields (`content`, `description`, `label`)
- [ ] No empty text fields in blocks (title, description, content must have values)
- [ ] Cover title has line breaks (`\n`) for visual formatting
- [ ] Tone consistency: if source thread is 반말, spec text should also be 반말 (and vice versa)
- [ ] No AI-ish expressions: read `../humanizer-korean/patterns/*.md` and check for pattern matches. If pattern files are unavailable, use fallback list: "혁신적인", "획기적인", "강력한", "놀라운", "핵심은 바로", "~라는 점에서", "~할 수 있다는 것이다", "다양한"

**Layout variety check:**
- [ ] No 3+ consecutive slides with the same layout
- [ ] At least 1 non-standard layout (split/hero/minimal) per 5+ slide spec

**Meta checks:**
- [ ] `series` matches tag convention (claude-code-recipe / github-recommendation / vibe-coding-class)
- [ ] `source_file` path is valid and file exists
- [ ] `created_at` is a valid date

### Phase 3: Visual Review

Read each rendered PNG and check for visual issues. Note: visual review depends on Claude's image analysis capabilities. Flag uncertain findings as Info severity, not Critical.

**Per-slide visual checks:**
- [ ] No text overflow or truncation (text cut off at edges)
- [ ] No empty/blank areas where content should be
- [ ] Proper spacing between blocks (no cramping or excessive gaps)
- [ ] Emojis render correctly (not showing as boxes or missing)
- [ ] Code blocks are readable (font size, contrast)
- [ ] Highlight words are visibly emphasized (lime/accent color)

**Overall visual checks:**
- [ ] Consistent visual style across all slides
- [ ] Cover slide has proper illustration (if cover_illustration is set)
- [ ] Closing slide has a clear visual hierarchy
- [ ] Theme is applied consistently (if theme is set)

### Phase 4: Generate Report

Categorize findings by severity:

```
## Review Report: topic-{slug}

### Summary
- Total slides: {N}
- Issues found: {count by severity}
- Verdict: PASS | NEEDS_FIX | CRITICAL

### Critical (must fix)
- [Slide 3] highlight_word "없으면" not found in parent text
- [Spec] total_slides (7) doesn't match actual count (6)

### Warning (should fix)
- [Slide 5] card-list has 4 items (recommended: 2-3)
- [Slide 2→4] Same layout "problem" used 3 times in a row

### Info (optional)
- [Slide 7] Consider using split layout for visual variety
- [Meta] author field is empty
```

**Severity definitions:**
- **Critical**: Will cause rendering errors or incorrect display. MUST fix.
- **Warning**: Content quality issues. SHOULD fix for better output.
- **Info**: Suggestions for improvement. Nice to have.

### Phase 5: Auto-Fix (if `--fix`)

If `--fix` flag is set and issues were found:

**Fix cycle (max 2 iterations):**

1. **Fix YAML spec** based on findings:
   - Fix `total_slides` mismatch
   - Remove invalid `highlight_word` entries
   - Reorder layouts for variety
   - Trim card-list to 3 items, step-list to 3-4 items
   - Fix tone inconsistencies

2. **Re-render affected slides:**
   ```bash
   # If specific slides changed
   node render.js specs/topic-{slug}.yaml --slide {N}

   # If structural changes (slide count, order)
   node render.js specs/topic-{slug}.yaml
   ```

3. **Re-check** the fixed slides for remaining issues

4. If issues remain after 2 cycles: report remaining issues and stop

### Phase 6: Final Verdict

```
Verdict: {PASS | NEEDS_FIX | CRITICAL}

PASS       — No critical/warning issues. Ready for publishing.
NEEDS_FIX  — Warnings found. Review suggested changes above.
CRITICAL   — Critical issues found. Must fix before publishing.
```

If `--fix` was used:
```
Auto-fix applied:
  Fixes: {count} issues resolved
  Re-rendered: slides {list}
  Remaining: {count} issues (see report above)
  Verdict: {updated verdict}
```

## Error Handling

- Spec not found: list available specs and stop
- No rendered PNGs found: suggest running `/render-card` first
- PNG read fails: skip visual review for that slide, note in report
- Auto-fix creates invalid YAML: revert to original and report

## Important Notes

- Visual review requires reading PNG images — Claude can analyze rendered slide images for layout issues
- The most common issues are: highlight_word mismatches, block count overflows, and tone inconsistency
- Auto-fix is conservative — it won't rewrite content, only fix structural issues
- Always re-render after YAML changes to verify the fix visually
- Run this after `/render-card` to catch issues before publishing
