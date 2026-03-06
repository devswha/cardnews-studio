const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { createApp, normalizeSpecSlug } = require("../server");

let server;
let baseUrl;

before(async () => {
  server = http.createServer(createApp());
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("normalizeSpecSlug", () => {
  it("accepts safe slugs", () => {
    assert.equal(normalizeSpecSlug("topic-oh-my-codex"), "topic-oh-my-codex");
  });

  it("rejects path traversal", () => {
    assert.throws(() => normalizeSpecSlug("../secret"), {
      message: "Invalid spec name",
    });
  });
});

describe("server editor api", () => {
  it("returns rendered slide files for an existing spec", async () => {
    const res = await fetch(baseUrl + "/api/specs/topic-oh-my-codex/output");
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.slug, "topic-oh-my-codex");
    assert.ok(Array.isArray(data.slides));
    assert.ok(data.slides.length > 0);
    assert.match(data.slides[0], /^\d+\.png$/);
  });

  it("rejects invalid slugs on json route", async () => {
    const res = await fetch(baseUrl + "/api/specs/%2E%2E%2Fsecret/json");
    assert.equal(res.status, 400);
  });

  it("rejects invalid spec payloads before saving", async () => {
    const res = await fetch(baseUrl + "/api/specs/topic-oh-my-codex", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meta: {},
        slides: [
          { slide: 1, layout: "cover", title: "", blocks: [] },
        ],
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /validation issue/i);
    assert.ok(Array.isArray(data.validation));
    assert.ok(data.validation.length > 0);
  });
});
