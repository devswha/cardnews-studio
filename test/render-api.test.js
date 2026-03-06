const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { listSpecs } = require("../src/render-api");

describe("listSpecs", () => {
  it("includes rendered output slide filenames when available", async () => {
    const specs = await listSpecs();
    const compact = specs.find((spec) => spec.slug === "topic-compact");

    assert.ok(compact, "expected topic-compact spec to exist");
    assert.equal(compact.hasOutput, true);
    assert.ok(Array.isArray(compact.outputSlides));
    assert.ok(compact.outputSlides.length > 0);
    assert.match(compact.outputSlides[0], /^\d+\.png$/);
  });
});
