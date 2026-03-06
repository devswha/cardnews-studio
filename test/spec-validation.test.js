const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Validator = require("../public/spec-validation.js");

describe("SpecValidation", () => {
  it("accepts a structurally valid spec", () => {
    const result = Validator.validateSpec({
      meta: { title: "Demo" },
      slides: [
        { slide: 1, layout: "cover", title: "Cover", blocks: [] },
        { slide: 2, layout: "howto", title: "How", blocks: [{ type: "text" }] },
      ],
    }, { text: {} });

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("reports duplicate slide numbers, missing titles, and unknown block types", () => {
    const result = Validator.validateSpec({
      meta: {},
      slides: [
        { slide: 1, layout: "cover", title: "", blocks: [{ type: "mystery" }] },
        { slide: 1, layout: "", title: "Duplicate", blocks: [] },
      ],
    }, { text: {} });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((issue) => /title is required/i.test(issue.message)));
    assert.ok(result.errors.some((issue) => /duplicated/i.test(issue.message)));
    assert.ok(result.errors.some((issue) => /unknown type/i.test(issue.message)));
    assert.ok(result.errors.some((issue) => /layout is required/i.test(issue.message)));
    assert.ok(result.warnings.some((issue) => /Meta title is empty/i.test(issue.message)));
  });

  it("summarizes validation failures", () => {
    const summary = Validator.summarize({ errors: [{}, {}] });
    assert.equal(summary, "Fix 2 validation issues before saving.");
  });
});
