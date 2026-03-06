const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Helpers = require("../public/app-helpers.js");

describe("AppHelpers", () => {
  it("normalizes spec items and preserves output slides", () => {
    const spec = Helpers.normalizeSpecItem({
      slug: "topic-oh-my-codex",
      title: "Oh my codex",
      theme: "warm",
      totalSlides: 7,
      hasOutput: true,
      outputSlides: ["01.png", "02.png"],
    });

    assert.deepEqual(spec, {
      slug: "topic-oh-my-codex",
      title: "Oh my codex",
      theme: "warm",
      totalSlides: 7,
      hasOutput: true,
      outputSlides: ["01.png", "02.png"],
    });
  });

  it("filters specs by slug, title, or theme", () => {
    const specs = [
      Helpers.normalizeSpecItem({ slug: "topic-oh-my-codex", title: "Oh My Codex", theme: "warm" }),
      Helpers.normalizeSpecItem({ slug: "topic-tmux", title: "tmux", theme: "" }),
    ];

    assert.equal(Helpers.filterSpecs(specs, "codex").length, 1);
    assert.equal(Helpers.filterSpecs(specs, "warm").length, 1);
    assert.equal(Helpers.filterSpecs(specs, "tmux").length, 1);
  });

  it("builds preview URLs only when rendered output exists", () => {
    const slides = Helpers.buildPreviewSlides({
      slug: "topic-oh-my-codex",
      outputSlides: ["01.png", "02.png"],
    }, 123);

    assert.deepEqual(slides, [
      "/output/topic-oh-my-codex/01.png?t=123",
      "/output/topic-oh-my-codex/02.png?t=123",
    ]);
  });
});
