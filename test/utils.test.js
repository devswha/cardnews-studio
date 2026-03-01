const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { escapeHtml, nl2br, highlightWord, clampPercent, safeClassSuffix } = require("../src/blocks/_utils");

describe("escapeHtml", () => {
  it("escapes HTML special characters", () => {
    assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it("escapes ampersand and single quotes", () => {
    assert.equal(escapeHtml("AT&T's"), "AT&amp;T&#39;s");
  });

  it("handles null and undefined", () => {
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
  });

  it("converts numbers to string", () => {
    assert.equal(escapeHtml(42), "42");
  });

  it("returns empty string for empty input", () => {
    assert.equal(escapeHtml(""), "");
  });
});

describe("nl2br", () => {
  it("converts newlines to <br>", () => {
    assert.equal(nl2br("line1\nline2"), "line1<br>line2");
  });

  it("handles \\r\\n", () => {
    assert.equal(nl2br("a\r\nb"), "a<br>b");
  });

  it("escapes HTML before converting newlines", () => {
    assert.equal(nl2br("<b>\n</b>"), "&lt;b&gt;<br>&lt;/b&gt;");
  });

  it("handles null", () => {
    assert.equal(nl2br(null), "");
  });
});

describe("highlightWord", () => {
  it("wraps keyword with highlight span", () => {
    const result = highlightWord("hello world", "world");
    assert.ok(result.includes('<span class="highlight">world</span>'));
    assert.ok(result.startsWith("hello "));
  });

  it("escapes HTML in both text and keyword", () => {
    const result = highlightWord("<b>test</b>", "<b>");
    assert.ok(!result.includes("<b>"));
    assert.ok(result.includes("&lt;b&gt;"));
  });

  it("returns escaped text when keyword not found", () => {
    assert.equal(highlightWord("hello", "xyz"), "hello");
  });

  it("returns escaped text when keyword is empty", () => {
    assert.equal(highlightWord("hello", ""), "hello");
  });

  it("handles null text and keyword", () => {
    assert.equal(highlightWord(null, null), "");
  });

  it("uses custom class name", () => {
    const result = highlightWord("abc", "b", "custom");
    assert.ok(result.includes('<span class="custom">'));
  });
});

describe("clampPercent", () => {
  it("returns value within 0-100", () => {
    assert.equal(clampPercent(50), 50);
  });

  it("clamps to 0 for negative", () => {
    assert.equal(clampPercent(-10), 0);
  });

  it("clamps to 100 for over 100", () => {
    assert.equal(clampPercent(150), 100);
  });

  it("returns 0 for NaN", () => {
    assert.equal(clampPercent("abc"), 0);
  });

  it("returns 0 for undefined", () => {
    assert.equal(clampPercent(undefined), 0);
  });

  it("handles string numbers", () => {
    assert.equal(clampPercent("75"), 75);
  });
});

describe("safeClassSuffix", () => {
  it("lowercases and strips unsafe chars", () => {
    assert.equal(safeClassSuffix("Hello World!", "fallback"), "helloworld");
  });

  it("keeps hyphens and alphanumeric", () => {
    assert.equal(safeClassSuffix("my-class-1", "x"), "my-class-1");
  });

  it("returns fallback for null", () => {
    assert.equal(safeClassSuffix(null, "default"), "default");
  });

  it("returns fallback for empty string result", () => {
    assert.equal(safeClassSuffix("!!!", "fallback"), "fallback");
  });
});
