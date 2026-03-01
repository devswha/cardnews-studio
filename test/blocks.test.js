const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { renderBlock } = require("../src/blocks");

// Helper: check that output is a non-empty string containing expected patterns
function assertHtml(html, ...patterns) {
  assert.equal(typeof html, "string");
  assert.ok(html.length > 0, "HTML should not be empty");
  for (const pattern of patterns) {
    assert.ok(html.includes(pattern), `Expected HTML to contain "${pattern}"`);
  }
}

// Helper: check XSS is escaped
function assertNoRawHtml(html, dangerous = "<script>") {
  assert.ok(!html.includes(dangerous), `HTML should not contain raw "${dangerous}"`);
}

describe("card-list", () => {
  it("renders items with emoji, title, description", () => {
    const html = renderBlock({
      type: "card-list",
      items: [{ emoji: "🚀", title: "Launch", description: "Go fast" }],
    });
    assertHtml(html, "card-list", "card-item", "🚀", "Launch", "Go fast");
  });

  it("renders empty items array", () => {
    const html = renderBlock({ type: "card-list", items: [] });
    assertHtml(html, "card-list");
  });

  it("escapes XSS in title", () => {
    const html = renderBlock({
      type: "card-list",
      items: [{ emoji: "x", title: '<script>alert("xss")</script>', description: "safe" }],
    });
    assertNoRawHtml(html);
  });

  it("handles default block (no items)", () => {
    const html = renderBlock({ type: "card-list" });
    assertHtml(html, "card-list");
  });

  it("highlights word in title", () => {
    const html = renderBlock({
      type: "card-list",
      items: [{ emoji: "✅", title: "Use Claude", highlight_word: "Claude", description: "" }],
    });
    assertHtml(html, '<span class="highlight">Claude</span>');
  });
});

describe("terminal-block", () => {
  it("renders lines with types", () => {
    const html = renderBlock({
      type: "terminal-block",
      title: "Terminal",
      lines: [
        { type: "command", text: "> npm start" },
        { type: "output", text: "Server running" },
        { type: "comment", text: "# done" },
      ],
    });
    assertHtml(html, "terminal-block", "terminal-line--command", "terminal-line--output", "terminal-line--comment");
  });

  it("renders with default title", () => {
    const html = renderBlock({ type: "terminal-block" });
    assertHtml(html, "Terminal");
  });

  it("highlights keyword in line", () => {
    const html = renderBlock({
      type: "terminal-block",
      lines: [{ type: "command", text: "> tmux new", highlight: "tmux" }],
    });
    assertHtml(html, '<span class="highlight">tmux</span>');
  });

  it("escapes XSS in text", () => {
    const html = renderBlock({
      type: "terminal-block",
      lines: [{ type: "output", text: '<img onerror="alert(1)">' }],
    });
    assertNoRawHtml(html, "<img");
  });
});

describe("code-editor", () => {
  it("renders code lines with indentation", () => {
    const html = renderBlock({
      type: "code-editor",
      title: "config.js",
      lines: [
        { type: "code", text: "const x = 1;", indent: 0 },
        { type: "comment", text: "// nested", indent: 1 },
      ],
    });
    assertHtml(html, "code-editor", "config.js", "const x = 1;", "code-line--comment");
  });

  it("renders empty lines", () => {
    const html = renderBlock({ type: "code-editor", title: "empty.js" });
    assertHtml(html, "code-editor", "empty.js");
  });
});

describe("before-after", () => {
  it("renders before and after cards", () => {
    const html = renderBlock({
      type: "before-after",
      before: { emoji: "❌", title: "Before", description: "Old way" },
      after: { emoji: "✅", title: "After", description: "New way" },
    });
    assertHtml(html, "before-after", "before-after-card--before", "before-after-card--after", "Before", "After");
  });

  it("renders with icon_url", () => {
    const html = renderBlock({
      type: "before-after",
      before: { icon_url: "data:image/png;base64,abc", title: "B", description: "" },
      after: { emoji: "✅", title: "A", description: "" },
    });
    assertHtml(html, "before-after-icon", "data:image/png;base64,abc");
  });

  it("escapes XSS in title and description", () => {
    const html = renderBlock({
      type: "before-after",
      before: { emoji: "x", title: "<script>xss</script>", description: "<b>bold</b>" },
      after: { emoji: "y", title: "safe", description: "ok" },
    });
    assertNoRawHtml(html);
  });
});

describe("step-list", () => {
  it("renders numbered steps", () => {
    const html = renderBlock({
      type: "step-list",
      items: [
        { step: 1, emoji: "🔧", title: "Setup", description: "Install" },
        { step: 2, emoji: "🚀", title: "Run", description: "Execute", code: "npm start" },
      ],
    });
    assertHtml(html, "step-list", "step-item", "Setup", "Run", "step-code", "npm start");
  });

  it("auto-numbers when step is missing", () => {
    const html = renderBlock({
      type: "step-list",
      items: [{ title: "First", description: "d" }],
    });
    assertHtml(html, "step-list");
  });

  it("renders empty items", () => {
    const html = renderBlock({ type: "step-list" });
    assertHtml(html, "step-list");
  });
});

describe("tip-box", () => {
  it("renders with label and content", () => {
    const html = renderBlock({
      type: "tip-box",
      label: "Pro Tip",
      content: "Use shortcuts",
    });
    assertHtml(html, "tip-box", "Pro Tip", "Use shortcuts");
  });

  it("uses default icon and label", () => {
    const html = renderBlock({ type: "tip-box", content: "test" });
    assertHtml(html, "💡", "Tip");
  });

  it("highlights word in content", () => {
    const html = renderBlock({
      type: "tip-box",
      content: "Use Claude for coding",
      highlight_word: "Claude",
    });
    assertHtml(html, '<span class="highlight">Claude</span>');
  });
});

describe("info-box", () => {
  it("renders with title and content", () => {
    const html = renderBlock({
      type: "info-box",
      title: "Did you know?",
      content: "Interesting fact",
    });
    assertHtml(html, "info-box", "Did you know?", "Interesting fact");
  });

  it("uses default icon", () => {
    const html = renderBlock({ type: "info-box" });
    assertHtml(html, "ℹ️");
  });
});

describe("highlight-banner", () => {
  it("renders content with bold and inline code", () => {
    const html = renderBlock({
      type: "highlight-banner",
      content: "Use the /compact command",
      bold_part: "Use",
      inline_code: "/compact",
    });
    assertHtml(html, "highlight-banner", "<strong>Use</strong>", "<code>/compact</code>");
  });

  it("renders without bold or code", () => {
    const html = renderBlock({
      type: "highlight-banner",
      content: "Simple message",
    });
    assertHtml(html, "highlight-banner", "Simple message");
  });

  it("appends inline_code if not in content", () => {
    const html = renderBlock({
      type: "highlight-banner",
      content: "Try this",
      inline_code: "/help",
    });
    assertHtml(html, "<code>/help</code>");
  });

  it("escapes XSS in content", () => {
    const html = renderBlock({
      type: "highlight-banner",
      content: '<script>alert("xss")</script>',
    });
    assertNoRawHtml(html);
  });
});

describe("table", () => {
  it("renders table with headers and rows", () => {
    const html = renderBlock({
      type: "table",
      columns: [{ header: "Feature" }, { header: "Puppeteer" }, { header: "Playwright" }],
      rows: [
        { label: "Speed", cells: [{ text: "Fast" }, { text: "Faster" }] },
      ],
    });
    assertHtml(html, "table-block", "Feature", "Puppeteer", "Playwright", "Speed", "Fast", "Faster");
  });

  it("renders empty table", () => {
    const html = renderBlock({ type: "table" });
    assertHtml(html, "table-block");
  });
});

describe("progress-bar", () => {
  it("renders with value and label", () => {
    const html = renderBlock({
      type: "progress-bar",
      label: "Usage",
      value: 75,
      display_text: "75%",
    });
    assertHtml(html, "progress-bar-block", "Usage", "75%", "width:75%");
  });

  it("clamps value over 100", () => {
    const html = renderBlock({ type: "progress-bar", value: 150 });
    assertHtml(html, "width:100%");
  });

  it("clamps negative value", () => {
    const html = renderBlock({ type: "progress-bar", value: -10 });
    assertHtml(html, "width:0%");
  });
});

describe("bar-list", () => {
  it("renders items with ratio bars", () => {
    const html = renderBlock({
      type: "bar-list",
      items: [
        { label: "React", ratio: 80, emoji: "⚛️" },
        { label: "Vue", ratio: 40, emoji: "💚" },
      ],
    });
    assertHtml(html, "bar-list", "React", "80%", "width:80%", "Vue", "40%");
  });

  it("renders empty items", () => {
    const html = renderBlock({ type: "bar-list" });
    assertHtml(html, "bar-list");
  });
});

describe("text", () => {
  it("renders text with default style", () => {
    const html = renderBlock({ type: "text", content: "Hello world" });
    assertHtml(html, "text-block", "text-block--normal", "Hello world");
  });

  it("renders with accent style", () => {
    const html = renderBlock({ type: "text", content: "Important", style: "accent" });
    assertHtml(html, "text-block--accent");
  });

  it("renders with muted style", () => {
    const html = renderBlock({ type: "text", content: "Note", style: "muted" });
    assertHtml(html, "text-block--muted");
  });

  it("escapes XSS", () => {
    const html = renderBlock({ type: "text", content: '<script>alert("xss")</script>' });
    assertNoRawHtml(html);
  });
});

describe("renderBlock", () => {
  it("throws on unknown block type", () => {
    assert.throws(() => renderBlock({ type: "nonexistent" }), {
      message: /Unknown block type/,
    });
  });

  it("throws on empty type", () => {
    assert.throws(() => renderBlock({}), {
      message: /Unknown block type/,
    });
  });
});
