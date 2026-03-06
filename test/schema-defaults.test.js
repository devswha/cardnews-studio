const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const SchemaDefaults = require("../public/schema-defaults.js");

describe("SchemaDefaults", () => {
  it("creates clean block defaults without schema metadata", () => {
    const block = SchemaDefaults.createDefaultBlock("card-list", {
      label: "Card List",
      fields: [
        {
          key: "items",
          type: "array",
          itemSchema: [
            { key: "emoji", type: "text" },
            { key: "title", type: "text" },
          ],
        },
      ],
    });

    assert.deepEqual(block, {
      type: "card-list",
      items: [],
    });
    assert.equal("label" in block, false);
    assert.equal("fields" in block, false);
  });

  it("creates nested object defaults from field definitions", () => {
    const nested = SchemaDefaults.createDefaultValueFromField({
      key: "before",
      type: "object",
      fields: [
        { key: "title", type: "text" },
        { key: "description", type: "textarea" },
        { key: "icon_url", type: "text", optional: true },
      ],
    });

    assert.deepEqual(nested, {
      title: "",
      description: "",
      icon_url: "",
    });
  });

  it("uses the first select option for required select fields", () => {
    const value = SchemaDefaults.createDefaultValueFromField({
      key: "layout",
      type: "select",
      options: ["cover", "hero", "closing"],
    });

    assert.equal(value, "cover");
  });
});
