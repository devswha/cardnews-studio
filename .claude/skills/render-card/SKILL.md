Render card news PNGs from a YAML spec: $ARGUMENTS

Parse arguments: first arg is spec name or path, `--slide N` renders only slide N, `--cover` forces cover illustration regeneration, `--no-cover` skips cover generation, `--theme <warm|8bit>` overrides theme.

## Overview

Run the card news rendering pipeline: optionally generate a cover illustration via Gemini API, then render all slides to PNG using Puppeteer. Validates output file count and sizes.

## Usage

```
/render-card topic-awesome-claude-skills
/render-card specs/topic-tailscale.yaml --slide 4
/render-card topic-omc --cover --theme warm
/render-card topic-vscode --no-cover
```

## Output

```
output/topic-{slug}/01.png ~ NN.png    # Rendered slide PNGs (2160x2700px @2x)
assets/illustrations/{slug}-cover.png   # Cover illustration (if generated)
```

## Execution Protocol

### Phase 1: Resolve Spec Path

**Step 0: Environment Check**
```bash
# node_modules must exist
[ ! -d "node_modules" ] && npm install

# Puppeteer/Chrome must be available
node -e "require('puppeteer')" 2>/dev/null || npm install
```

1. If bare name (no `/` or `.yaml`): resolve to `specs/topic-{name}.yaml`
   - Also try `specs/{name}.yaml` if first doesn't exist
2. If path provided: use directly
3. Verify spec file exists. If not, list available specs and stop.
4. Parse spec YAML to extract `meta` (total_slides, cover_illustration, theme)

### Phase 2: Cover Illustration (Conditional)

**Skip if:** `--no-cover` flag is set

**Generate if:**
- `--cover` flag is set (force regenerate), OR
- `meta.cover_illustration` is empty/missing, OR
- The referenced illustration file doesn't exist in `assets/illustrations/`

**Cover generation steps:**
1. Run cover generation:
   ```bash
   node src/generate-cover.js specs/topic-{slug}.yaml
   ```
2. Post-process for background transparency:
   ```bash
   magick assets/illustrations/{slug}-cover.png \
     -fuzz 15% -transparent '#121212' \
     assets/illustrations/{slug}-cover.png
   ```
   Note: Use `magick` (ImageMagick 7+). If not found, try `convert` (ImageMagick 6). If neither available, warn and skip transparency.
3. Verify cover file exists and is non-empty

### Phase 3: Render Slides

Run the renderer:

```bash
# Full render
node render.js specs/topic-{slug}.yaml

# Single slide
node render.js specs/topic-{slug}.yaml --slide {N}

# With theme override
node render.js specs/topic-{slug}.yaml --theme {theme}
```

Capture stdout/stderr for error reporting.

### Phase 4: Verify Output

1. Count PNG files in `output/topic-{slug}/`:
   ```bash
   ls output/topic-{slug}/*.png | wc -l
   ```
2. Expected count: `meta.total_slides` (or 1 if `--slide` was used)
3. Check file sizes — each PNG should be >50KB (small files may indicate rendering failure)
   ```bash
   ls -la output/topic-{slug}/*.png
   ```
4. If count mismatch: report which slides are missing

### Phase 5: Report

```
Render complete:
  Spec: specs/topic-{slug}.yaml
  Output: output/topic-{slug}/
  Slides: {rendered}/{expected} PNGs
  Cover: {generated | skipped | existing}
  Theme: {theme or "default (dark)"}
  Total size: {sum of PNG sizes}
```

If `--slide` was used:
```
Rendered slide {N}:
  File: output/topic-{slug}/{NN}.png
  Size: {file size}
```

## Error Handling

- Spec not found: list available specs (`ls specs/topic-*.yaml`) and stop
- `npm install` needed: run it automatically, then retry
- Cover generation fails (API error): warn and continue with rendering (cover slide will render without illustration)
- ImageMagick not available for transparency: warn but continue — the cover will work, just with a visible background color
- Render fails on specific slide: report the error with slide number and block types for debugging
- PNG count mismatch: list missing slides and suggest checking the spec YAML

## Important Notes

- Always run from the `card-news/` directory (cd if needed)
- Cover illustration transparency post-processing is critical — without it, the dark background creates a visible box on the cover slide
- The `--slide` flag is useful for iterating on a single slide without re-rendering everything
- Rendered PNGs are @2x (2160x2700px) for high-DPI displays
- If render.js fails, check that all block types used in the spec are registered in `src/blocks/index.js`


## Examples

See `examples/` directory for rendered output references (cover, content slide, closing slide).
