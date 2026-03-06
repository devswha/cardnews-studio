const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeSpecItem,
  filterSpecs,
  buildPreviewSlides,
  previewPlaceholderForSpec,
  resolveThemeSelection,
} = require("../public/app-helpers");

describe("normalizeSpecItem", () => {
  it("normalizes partial spec metadata safely", () => {
    const spec = normalizeSpecItem({
      slug: "topic-demo",
      title: "Demo",
      totalSlides: "7",
      hasOutput: 1,
      outputSlides: ["01.png"],
    });

    assert.deepEqual(spec, {
      slug: "topic-demo",
      title: "Demo",
      theme: "",
      totalSlides: 7,
      hasOutput: true,
      outputSlides: ["01.png"],
    });
  });
});

describe("filterSpecs", () => {
  const specs = [
    normalizeSpecItem({ slug: "topic-alpha", title: "Alpha", theme: "warm" }),
    normalizeSpecItem({ slug: "topic-beta", title: "Beta Guide", theme: "" }),
  ];

  it("returns all specs for an empty query", () => {
    assert.equal(filterSpecs(specs, "").length, 2);
  });

  it("matches against slug, title, and theme", () => {
    assert.equal(filterSpecs(specs, "guide")[0].slug, "topic-beta");
    assert.equal(filterSpecs(specs, "warm")[0].slug, "topic-alpha");
  });
});

describe("buildPreviewSlides", () => {
  it("builds cache-busted preview urls from output slides", () => {
    const spec = normalizeSpecItem({
      slug: "topic-demo",
      outputSlides: ["01.png", "02.png"],
    });
    const urls = buildPreviewSlides(spec, 12345);

    assert.deepEqual(urls, [
      "/output/topic-demo/01.png?t=12345",
      "/output/topic-demo/02.png?t=12345",
    ]);
  });

  it("returns empty array when no output slides exist", () => {
    assert.deepEqual(buildPreviewSlides(normalizeSpecItem({ slug: "topic-demo" })), []);
  });
});

describe("previewPlaceholderForSpec", () => {
  it("provides contextual empty-state messages", () => {
    assert.equal(previewPlaceholderForSpec(null), "Select a spec to start editing");
    assert.equal(
      previewPlaceholderForSpec(normalizeSpecItem({ slug: "topic-empty", totalSlides: 0 })),
      "This spec has no slides yet. Add a slide to get started."
    );
    assert.equal(
      previewPlaceholderForSpec(normalizeSpecItem({ slug: "topic-draft", totalSlides: 3 })),
      "No rendered preview yet. Click Render All or render a slide."
    );
  });
});

describe("resolveThemeSelection", () => {
  it("returns the spec theme when available", () => {
    assert.equal(
      resolveThemeSelection(normalizeSpecItem({ slug: "topic-demo", theme: "warm" }), ["warm", "8bit"]),
      "warm"
    );
  });

  it("falls back when the spec theme is missing or unavailable", () => {
    assert.equal(resolveThemeSelection(normalizeSpecItem({ slug: "topic-demo" }), ["warm"]), "");
    assert.equal(
      resolveThemeSelection(normalizeSpecItem({ slug: "topic-demo", theme: "retro" }), ["warm", "8bit"]),
      ""
    );
  });
});
