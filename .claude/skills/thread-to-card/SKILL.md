Convert a thread markdown file to a card news YAML spec: $ARGUMENTS

Parse arguments: first arg is thread path or number, `--tag <Tip|Github|Class>` helps resolve by number, `--theme <warm|8bit>` sets theme (optional), `--slides <5-10>` overrides slide count (optional).

## Overview

Read an existing thread markdown file, analyze its content structure, and generate a card news YAML spec following the project's design system. Maps text patterns to appropriate block types and chooses layouts for visual variety.

## Usage

```
/thread-to-card threads/github/06-awesome-claude-skills.md
/thread-to-card 06 --tag Github
/thread-to-card threads/tips/12-tailscale.md --theme warm --slides 7
```

## Output

```
specs/topic-{slug}.yaml    # Card news YAML spec
```

## Execution Protocol

### Phase 1: Resolve Thread File

1. If path provided: use directly
2. If number + tag provided: resolve to `../threads/{category}/{NN}-*.md`
   - Tip → `tips/`, Github → `github/`, Class → `class/`
3. Parse frontmatter: extract `number`, `tag`, `title`, `tone`, `created`
4. Parse body: split on `## 본문`, `## 답글 1`, `## 답글 2`, etc.

### Phase 2: Analyze Content

For each section (본문 + 답글), identify:

1. **Content patterns** — map to block types:
   | Pattern in text | Block type |
   |----------------|------------|
   | CLI commands, terminal examples | terminal-block |
   | Feature/advantage lists | card-list / icon-grid |
   | Numbers, stats, percentages | number-stat |
   | Sequential steps, procedures | step-list |
   | Before/after comparisons | before-after |
   | Config files, code snippets | code-editor |
   | Tips, warnings, notes | tip-box / info-box |
   | Key one-liner takeaway | highlight-banner |
   | Quotes, citations | quote-box |
   | Grid-worthy items (4+ short items) | icon-grid |

2. **Complexity assessment**:
   - Simple (1 본문 + 2 답글) → 5-6 slides
   - Medium (1 본문 + 3 답글) → 6-8 slides
   - Complex (1 본문 + 4 답글) → 7-10 slides
   - `--slides` flag overrides this

3. **Key messages**: Extract the core insight from each section

### Phase 3: Plan Slide Structure

Design the slide sequence ensuring visual variety:

**Standard pattern:**
```
cover → problem → [content slides] → closing
```

**Layout variety rules:**
- Never use the same layout 3 times in a row
- Include at least 1 non-standard layout (split, hero, or minimal) per 5 slides
- Use `split` for feature grids, side-by-side info
- Use `hero` for key insights, impressive numbers
- Use `minimal` for quotes, single stats
- Cover is always `cover`, last slide is always `closing`

**Series convention from tag:**
- Tip → `series: "claude-code-recipe"`
- Github → `series: "github-recommendation"`
- Class → `series: "vibe-coding-class"`

### Phase 4: Generate YAML

Build the complete spec:

```yaml
meta:
  title: "{cover title with \\n for line breaks}"
  subtitle: "{subtitle}"
  series: "{series from tag}"
  tag: "{series from tag}"       # tag and series hold the same value. tag: render.js badge display, series: metadata grouping.
  author: ""                     # Reserved for future multi-author support. render.js ignores empty values.
  author_handle: ""
  total_slides: {N}
  cover_illustration: ""
  source_tip: {number from frontmatter}
  source_file: "../threads/{category}/{NN}-{slug}.md"
  created_at: "{YYYY-MM-DD}"

slides:
  - slide: 1
    layout: cover
    title: "{multi-line cover title}"
    subtitle: "{subtitle}"
    blocks: []

  - slide: 2
    layout: problem
    title: "{problem/hook}"
    subtitle: "{context}"
    blocks:
      - type: card-list
        items: [...]
      ...

  ...

  - slide: {N}
    layout: closing
    title: "{closing message}"
    subtitle: "{call to action}"
    blocks:
      - type: card-list
        items: [...]
      - type: highlight-banner
        content: "{final takeaway}"
        bold_part: "{key phrase}"
```

**Block composition rules:**
- Max 2 blocks per slide (3 in exceptional cases)
- card-list: 2-3 items per list
- step-list: 3 items is ideal
- terminal-block + tip-box is a great combo
- Closing slide: card-list (3 items) + highlight-banner

**highlight_word usage:**
- Must be an exact substring of the text it appears in
- Used for lime/accent color emphasis
- Apply sparingly — 1-2 per spec, on the most impactful words

### Phase 5: Validate

Before saving, verify:

1. `total_slides` matches actual slide count
2. Every slide has `slide`, `layout`, `title`, `blocks`
3. No slide has more than 3 blocks
4. card-list items are 2-3 per block
5. step-list items are ≤4 per block
6. All `highlight_word` values are exact substrings of their parent text
7. YAML is syntactically valid
8. Layout sequence has visual variety (no 3+ same layouts in a row)
9. Cover slide has `blocks: []`
10. Closing slide exists as the last slide

### Phase 6: Save & Report

1. Determine slug from thread filename (e.g., `06-awesome-claude-skills.md` → `awesome-claude-skills`)
2. Save to `specs/topic-{slug}.yaml`
3. Print summary:

```
Spec created:
  File: specs/topic-{slug}.yaml
  Source: {thread path}
  Slides: {N}
  Theme: {theme or "default (dark)"}
  Layouts: cover → problem → split → hero → howto → closing
```

## Error Handling

- Thread file not found: list available threads (`ls ../threads/{tips,github,class}/`) and stop
- Frontmatter missing required fields: warn and use defaults
- YAML validation fails: auto-fix and re-validate once. If still failing, save with warning in report
- Slide count outside 5-10: adjust content density
- Unrecoverable error: report what completed (thread parsed, slides planned, etc.) and suggest re-running `/thread-to-card` with the thread path

## Important Notes

- The cover title should use `\n` for line breaks to create visual impact (2-3 lines)
- The closing slide should leave a memorable final message
- Prefer concrete emojis over generic ones (use tool-specific emojis when possible)
- Match the thread's tone in all text content
- `source_file` uses `../threads/{category}/{NN}-{slug}.md` (relative to card-news/), per CLAUDE.md Path Conventions. Legacy specs may use other formats; generate-cover.js handles fallback resolution.


## Examples

See `examples/` directory for a sample YAML spec output.
