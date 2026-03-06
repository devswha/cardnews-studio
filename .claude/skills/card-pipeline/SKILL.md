Full end-to-end pipeline: write thread, generate spec, render card news, and review: $ARGUMENTS

Parse arguments: first quoted string is the topic, `--tag <Tip|Github|Class>` sets category (required), `--tone <반말|존댓말>` sets tone (default: 반말), `--repo <github-url>` for Github tag, `--theme <warm|8bit>` sets theme (optional), `--skip-review` skips the review phase, `--skip-thread` starts from an existing thread (provide path instead of topic).

## Overview

Orchestrate the complete thread → card news workflow by chaining all 4 skills sequentially with gate checks between each phase. Each phase must succeed before the next begins.

```
write-thread → thread-to-card → render-card → review-card
```

## Usage

```
/card-pipeline "Claude MCP 서버 만들기" --tag Tip
/card-pipeline "Some Cool Repo" --tag Github --repo https://github.com/org/repo --theme warm
/card-pipeline "환경 설정" --tag Class --tone 존댓말 --skip-review
/card-pipeline --skip-thread threads/tips/12-tailscale.md --theme 8bit
```

## Output

```
../threads/{category}/{NN}-{slug}.md         # Thread file (unless --skip-thread)
../threads/index.md                           # Updated index (unless --skip-thread)
specs/topic-{slug}.yaml                       # Card news spec
output/topic-{slug}/01.png ~ NN.png           # Rendered PNGs
assets/illustrations/{slug}-cover.png          # Cover illustration
Review report                                  # QA report (unless --skip-review)
```

## Execution Protocol

### Phase 0: Parse All Flags

Extract all arguments upfront:

| Flag | Required | Default | Notes |
|------|----------|---------|-------|
| topic | Yes* | — | First quoted string (*not needed with --skip-thread) |
| `--tag` | Yes* | — | Tip / Github / Class (*not needed with --skip-thread) |
| `--tone` | No | 반말 | 반말 / 존댓말 |
| `--repo` | No | — | GitHub URL for Github tag |
| `--theme` | No | — | warm / 8bit / default dark |
| `--skip-review` | No | false | Skip review phase |
| `--skip-thread` | No | false | Start from existing thread path |

Validate:
- If no `--skip-thread`: topic and `--tag` are required
- If `--skip-thread`: the provided path must exist
- If `--tag Github` and no `--repo`: warn but continue

Print pipeline plan:
```
Pipeline: {topic}
  Tag: {tag} | Tone: {tone} | Theme: {theme or "default"}
  Phases: write-thread → thread-to-card → render-card{" → review-card" unless skip-review}
```

### Phase 0.5: Pre-flight Dependency Check

Verify all pipeline dependencies before starting any work. Fail fast to avoid wasted effort.

```bash
# Run all checks in one pass
echo "Pre-flight checks..."
[ -d node_modules ] && echo "✓ node_modules" || echo "✗ node_modules missing"
[ -f .env ] && grep -q GEMINI_API_KEY .env && echo "✓ GEMINI_API_KEY" || echo "✗ GEMINI_API_KEY missing in .env"
node -e "require('puppeteer')" 2>/dev/null && echo "✓ Puppeteer" || echo "✗ Puppeteer not available"
[ -d ../humanizer-korean/patterns ] && echo "✓ humanizer-korean patterns" || echo "✗ humanizer-korean/patterns missing"
[ -f ../threads/index.md ] && echo "✓ threads/index.md" || echo "✗ threads/index.md missing"
```

**Required for all pipelines:**
- [ ] `node_modules/` exists (run `npm install` if missing)
- [ ] Puppeteer is importable (needed for Phase 3 rendering)
- [ ] `../threads/index.md` is readable (needed for Phase 1 numbering)

**Required unless `--skip-thread`:**
- [ ] `../humanizer-korean/patterns/` directory exists (needed for Phase 1 humanizer)

**Required unless `--no-cover`:**
- [ ] `GEMINI_API_KEY` exists in `.env` (needed for Phase 3 cover generation)

If any required check fails:
1. Print all results (both pass and fail) so user sees the full picture
2. Suggest the fix (e.g., `npm install`, `cp .env.example .env`)
3. Stop pipeline before Phase 1

### Phase 1: Write Thread (or resolve existing)

**If `--skip-thread`:**
- Use the provided thread path directly
- Parse frontmatter to extract tag, tone, title (use tag for series resolution in Phase 2)
- Skip to Phase 2

**Otherwise:**
Follow the write-thread.md workflow. Key steps:
1. Research (Context7/WebSearch/gh CLI based on tag)
2. Plan 본문 hook + 답글 structure per CLAUDE.md rules
3. Write thread markdown with frontmatter
4. Structural review (16-item checklist, auto-fix if needed)
5. Humanizer pass (read patterns from `../humanizer-korean/patterns/`)
6. Save to `../threads/{category}/{NN}-{slug}.md` + update `../threads/index.md`

See write-thread.md for detailed instructions on each step.

**Gate check:**
- [ ] Thread file exists at expected path
- [ ] File has valid frontmatter (number, tag, title, tone)
- [ ] File has `## 본문` and at least one `## 답글`
- If gate fails: stop pipeline, report error

### Phase 2: Thread → Card News Spec

Follow the thread-to-card.md workflow. Key steps:
1. Read thread file, parse frontmatter + body sections
2. Map text patterns to block types (per CLAUDE.md block reference)
3. Plan slide structure with layout variety (split/hero/minimal)
4. Generate YAML spec with meta + slides
5. Validate (total_slides, block limits, highlight_word, YAML syntax)
6. Save to `specs/topic-{slug}.yaml`

Pass `--theme` and `--slides` if provided. See thread-to-card.md for detailed block mapping and layout rules.

**Gate check:**
- [ ] Spec file exists at `specs/topic-{slug}.yaml`
- [ ] YAML is parseable
- [ ] `total_slides` matches slide array length
- If gate fails: stop pipeline, report error with spec content

### Phase 3: Render Card News

Follow the render-card.md workflow. Key steps:
1. Environment check (node_modules, Puppeteer)
2. Generate cover illustration via Gemini API (unless `--no-cover`)
3. Post-process cover for transparency (magick/convert)
4. Render all slides to PNG via `node render.js`

Pass `--theme` if provided. Always include `--cover` for fresh specs. See render-card.md for cover generation and rendering details.

**Gate check:**
- [ ] PNG count matches `total_slides`
- [ ] All PNGs are >50KB
- [ ] Cover illustration exists (if not --no-cover)
- If gate fails: report which slides failed, stop pipeline

### Phase 4: Review & QA (unless `--skip-review`)

Follow the review-card.md workflow with `--fix`. Key steps:
1. Content review (structure, highlight_word, tone, AI expressions)
2. Visual review (read PNGs, check rendering quality)
3. Auto-fix issues if found, re-render affected slides
4. Generate final report with severity ratings

See review-card.md for full checklist and severity definitions.

**Verdict handling:**
- **PASS**: Continue to summary
- **NEEDS_FIX** (after auto-fix): Continue with warnings
- **CRITICAL** (after auto-fix): Stop pipeline, report issues

### Phase 5: Summary

Print final pipeline summary:

```
Pipeline Complete: {topic}

  Thread:  ../threads/{category}/{NN}-{slug}.md
  Spec:    specs/topic-{slug}.yaml
  Output:  output/topic-{slug}/ ({N} slides)
  Cover:   assets/illustrations/{slug}-cover.png
  Review:  {PASS | NEEDS_FIX | SKIPPED}
  Theme:   {theme or "default (dark)"}

  Files created:
    1. threads/{category}/{NN}-{slug}.md
    2. threads/index.md (updated)
    3. specs/topic-{slug}.yaml
    4. output/topic-{slug}/01.png ~ {NN}.png
    5. assets/illustrations/{slug}-cover.png
```

## Error Handling

Each phase has a gate check. If any gate fails:
1. Print which phase failed and why
2. Print what was completed successfully
3. Suggest the specific skill command to retry the failed phase manually

Example:
```
Pipeline stopped at Phase 3 (render-card)

  Completed:
    Phase 1: threads/tips/13-mcp-server.md
    Phase 2: specs/topic-mcp-server.yaml

  Failed:
    Phase 3: Puppeteer render failed — "Could not find Chrome"

  To retry:
    /render-card topic-mcp-server
```

## Cancellation

Say "stop" or "cancel" at any point. Completed phases' outputs are preserved.

## Important Notes

- This is a sequential pipeline — each phase depends on the previous one
- The full pipeline typically takes 2-3 minutes (mostly cover illustration generation)
- Use `--skip-review` for quick iterations; run `/review-card` separately later
- Use `--skip-thread` when the thread already exists and you just need card news
- Cover illustration generation requires `GEMINI_API_KEY` in `.env`
- If any phase's gate check fails, fix the issue and run the remaining phases individually
