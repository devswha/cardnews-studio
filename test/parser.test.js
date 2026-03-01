const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs/promises");
const os = require("os");

// We need to test the internal functions, so require the module and test via parseSpec
const { parseSpec } = require("../src/parser");

async function createTempYaml(content) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cardnews-test-"));
  const tmpFile = path.join(tmpDir, "test.yaml");
  await fs.writeFile(tmpFile, content, "utf8");
  return { tmpFile, tmpDir };
}

async function cleanupTemp(tmpDir) {
  await fs.rm(tmpDir, { recursive: true, force: true });
}

describe("parseSpec", () => {
  it("parses valid YAML with meta and slides", async () => {
    const yaml = `
meta:
  title: "Test Title"
  subtitle: "Sub"
  total_slides: 2
slides:
  - slide: 1
    layout: cover
    title: "Cover"
    blocks: []
  - slide: 2
    layout: content
    title: "Content"
    blocks: []
`;
    const { tmpFile, tmpDir } = await createTempYaml(yaml);
    try {
      const { meta, slides } = await parseSpec(tmpFile);
      assert.equal(meta.title, "Test Title");
      assert.equal(meta.subtitle, "Sub");
      assert.equal(slides.length, 2);
      assert.equal(slides[0].layout, "cover");
      assert.equal(slides[1].layout, "content");
    } finally {
      await cleanupTemp(tmpDir);
    }
  });

  it("provides defaults for missing meta fields", async () => {
    const yaml = `
slides:
  - slide: 1
    layout: cover
    title: "Only Slide"
    blocks: []
`;
    const { tmpFile, tmpDir } = await createTempYaml(yaml);
    try {
      const { meta } = await parseSpec(tmpFile);
      assert.equal(meta.title, "Only Slide");
      assert.equal(meta.series, "claude-code-recipe");
      assert.ok(meta.created_at);
    } finally {
      await cleanupTemp(tmpDir);
    }
  });

  it("sorts slides by slide number", async () => {
    const yaml = `
slides:
  - slide: 3
    layout: closing
    title: "Third"
    blocks: []
  - slide: 1
    layout: cover
    title: "First"
    blocks: []
  - slide: 2
    layout: content
    title: "Second"
    blocks: []
`;
    const { tmpFile, tmpDir } = await createTempYaml(yaml);
    try {
      const { slides } = await parseSpec(tmpFile);
      assert.equal(slides[0].slide, 1);
      assert.equal(slides[1].slide, 2);
      assert.equal(slides[2].slide, 3);
    } finally {
      await cleanupTemp(tmpDir);
    }
  });

  it("throws on duplicate slide numbers", async () => {
    const yaml = `
slides:
  - slide: 1
    layout: cover
    title: "First"
    blocks: []
  - slide: 1
    layout: content
    title: "Duplicate"
    blocks: []
`;
    const { tmpFile, tmpDir } = await createTempYaml(yaml);
    try {
      await assert.rejects(() => parseSpec(tmpFile), {
        message: "Duplicate slide number: 1",
      });
    } finally {
      await cleanupTemp(tmpDir);
    }
  });

  it("handles empty slides array", async () => {
    const yaml = `
meta:
  title: "Empty"
slides: []
`;
    const { tmpFile, tmpDir } = await createTempYaml(yaml);
    try {
      const { slides } = await parseSpec(tmpFile);
      assert.equal(slides.length, 0);
    } finally {
      await cleanupTemp(tmpDir);
    }
  });

  it("assigns default slide numbers when missing", async () => {
    const yaml = `
slides:
  - layout: cover
    title: "No Number"
    blocks: []
`;
    const { tmpFile, tmpDir } = await createTempYaml(yaml);
    try {
      const { slides } = await parseSpec(tmpFile);
      assert.equal(slides[0].slide, 1);
    } finally {
      await cleanupTemp(tmpDir);
    }
  });

  it("throws on invalid YAML", async () => {
    const yaml = "not: [valid: yaml: {{";
    const { tmpFile, tmpDir } = await createTempYaml(yaml);
    try {
      await assert.rejects(() => parseSpec(tmpFile));
    } finally {
      await cleanupTemp(tmpDir);
    }
  });
});
