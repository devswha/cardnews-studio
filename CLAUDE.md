# cardnews-studio

YAML-based card news (social media carousel) PNG generator with a web editor.

## Quick Reference

```bash
npm install                          # install dependencies
npm start                            # start web editor at http://localhost:3456
node render.js <spec.yaml>           # render all slides to output/
node render.js <spec.yaml> --slide 3 # render single slide
node render.js <spec.yaml> --theme warm  # apply theme
npm test                             # run tests
```

Output: `output/{slug}/01.png ~ NN.png` (1080x1350 @2x)

## YAML Spec Format

```yaml
meta:
  title: "Card title"
  subtitle: "Subtitle"
  author: "Author name"
  author_handle: "@handle"
  total_slides: 5           # auto-counted if omitted
  theme: null               # null | "8bit" | "warm"
  cover_illustration: ""    # filename in assets/illustrations/

slides:
  - slide: 1
    layout: cover            # see Layout Options below
    title: "Slide title"
    subtitle: "Optional subtitle"
    blocks:                  # see Block Types below
      - type: card-list
        items:
          - emoji: "🚀"
            title: "Item title"
            description: "Item description"
```

## Layout Options

| Layout | Purpose |
|--------|---------|
| `cover` | Title slide |
| `problem` | Problem statement |
| `explanation` | Concept explanation |
| `solution` | Solution presentation |
| `howto` | Step-by-step guide |
| `comparison` | Side-by-side comparison |
| `advanced` | Deep-dive content |
| `workflow` | Process/flow |
| `split` | Left-right split (magazine style) |
| `hero` | Large title, high impact |
| `minimal` | Whitespace-focused |
| `closing` | Ending slide |

## Block Types

### card-list
List of cards with emoji, title, description.
```yaml
- type: card-list
  items:
    - emoji: "😱"
      title: "Card title"
      description: "Card description\nwith line breaks"
      highlight_word: "title"   # optional: bold highlight
```

### terminal-block
Terminal/console output display.
```yaml
- type: terminal-block
  title: "Terminal"
  lines:
    - type: command       # command | output | comment
      text: "npm start"
      highlight: "start"  # optional
```

### code-editor
Code editor display with syntax-like formatting.
```yaml
- type: code-editor
  title: "app.js"
  lines:
    - type: code          # code | comment | list-item
      text: "const app = express()"
      indent: 0           # optional indent level
```

### before-after
Before/after comparison cards.
```yaml
- type: before-after
  before:
    emoji: "😫"           # or icon_url for image
    title: "Before"
    description: "Old way"
    bg_color: "#FFF0F0"   # optional
  after:
    emoji: "😊"
    title: "After"
    description: "New way"
    bg_color: "#F0FFF4"
```

### step-list
Numbered step-by-step list.
```yaml
- type: step-list
  items:
    - step: 1             # optional step number
      emoji: "📝"
      title: "Step title"
      description: "Step description"
      code: "npm install"     # optional inline code
      highlight_word: "title" # optional
```

### tip-box
Tip callout box.
```yaml
- type: tip-box
  icon: "💡"              # optional
  label: "Tip"
  content: "Tip content here"
  highlight_word: "content"  # optional
```

### info-box
Information callout box.
```yaml
- type: info-box
  icon: "ℹ️"              # optional
  title: "Info title"
  content: "Info content"
  highlight_word: "title"  # optional
```

### highlight-banner
Highlighted text banner.
```yaml
- type: highlight-banner
  content: "Important message here"
  bold_part: "Important"       # optional
  inline_code: "npm start"    # optional
```

### table
Data table with headers and rows.
```yaml
- type: table
  columns:
    - header: "Feature"
      highlight_color: "#6B9B7D"  # optional
    - header: "Status"
  rows:
    - label: "Row 1"
      cells:
        - text: "Cell content"
          highlight_color: "#6B9B7D"  # optional
```

### progress-bar
Progress/percentage bar.
```yaml
- type: progress-bar
  label: "Completion"
  value: 87               # 0-100
  display_text: "87%"     # optional
  color: "#D4845C"        # optional bar color
```

### bar-list
Multiple horizontal bars for comparison.
```yaml
- type: bar-list
  items:
    - emoji: "🚀"         # optional
      label: "Speed"
      ratio: 90            # 0-100
```

### number-stat
Large number statistic display.
```yaml
- type: number-stat
  value: "42%"
  label: "Improvement rate"
  highlight_word: "rate"   # optional
```

### quote-box
Quotation display.
```yaml
- type: quote-box
  content: "Quote text here"
  author: "Author name"   # optional
  style: default           # default | accent
```

### icon-grid
Grid of icons with labels (2 or 3 columns).
```yaml
- type: icon-grid
  columns: 3              # 2 or 3 (optional, default 2)
  items:
    - emoji: "🚀"
      title: "Feature"
      description: "Optional description"
```

### text
Plain text block.
```yaml
- type: text
  content: "Text content here"
  style: normal            # normal | muted | accent
```

## File Structure

```
render.js          # CLI renderer (entry point)
server.js          # Web editor server
src/parser.js      # YAML spec parser
src/renderer.js    # Puppeteer screenshot renderer
src/template-engine.js  # Handlebars template engine
src/blocks/        # Block type renderers (16 types)
templates/         # Handlebars slide templates
styles/            # CSS (base + themes: 8bit, warm)
public/            # Web editor frontend
examples/          # Example YAML specs
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | Web editor server port |
| `GEMINI_API_KEY` | — | (Optional) For AI cover illustration |
| `CARDNEWS_AI_BACKEND` | `cli` | AI backend: `cli` or `google` |
