const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const path = require("path");
const Module = require("node:module");
const { createApp, normalizeSpecSlug } = require("../server");

let server;
let baseUrl;
const SPECS_DIR = path.resolve(__dirname, "..", "specs");
const OUTPUT_DIR = path.resolve(__dirname, "..", "output");
const SERVER_MODULE_PATH = path.resolve(__dirname, "..", "server.js");
const GENERATED_SPEC = {
  meta: {
    title: "Generated Draft",
    total_slides: 1,
  },
  slides: [
    {
      slide: 1,
      layout: "cover",
      title: "Generated Draft",
      blocks: [],
    },
  ],
};
const FETCHED_ARTICLE = {
  title: "Fetched headline",
  content: "Fetched article body",
  source: "https://example.com/story",
};
const SLIDE_VARIANT_SPEC = {
  meta: {
    title: "Variant Deck",
    total_slides: 3,
  },
  slides: [
    { slide: 1, layout: "cover", title: "Cover", blocks: [] },
    { slide: 2, layout: "content", title: "Current middle slide", subtitle: "", blocks: [] },
    { slide: 3, layout: "closing", title: "Closing", blocks: [] },
  ],
};
const GENERATED_SLIDE_VARIANT = {
  slide: 2,
  layout: "split",
  title: "Improved middle slide",
  subtitle: "Sharper framing",
  blocks: [],
};

function specPath(slug) {
  return path.join(SPECS_DIR, `${slug}.yaml`);
}

function outputPath(slug) {
  return path.join(OUTPUT_DIR, slug);
}

function cleanupSpecArtifacts(slug) {
  fs.rmSync(specPath(slug), { force: true });
  fs.rmSync(outputPath(slug), { recursive: true, force: true });
}

function findRenderedSlug() {
  return fs
    .readdirSync(OUTPUT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(specPath(entry.name)))
    .find((entry) =>
      fs.readdirSync(outputPath(entry.name)).some((file) => /^\d+\.png$/i.test(file))
    )?.name;
}

function makeSlug(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadFreshModule(modulePath, mocks = {}) {
  delete require.cache[modulePath];

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

async function withMockedServer(mocks, run) {
  const freshServerModule = loadFreshModule(SERVER_MODULE_PATH, mocks);
  const localServer = http.createServer(freshServerModule.createApp());

  await new Promise((resolve) => {
    localServer.listen(0, "127.0.0.1", resolve);
  });

  const localBaseUrl = `http://127.0.0.1:${localServer.address().port}`;

  try {
    return await run(localBaseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      localServer.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

before(async () => {
  server = http.createServer(createApp());
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

describe("server AI and URL routes", () => {
  it("serves template presets via /api/templates", async () => {
    const res = await fetch(baseUrl + "/api/templates");
    assert.equal(res.status, 200);

    const templates = await res.json();
    assert.equal(Array.isArray(templates), true);
    assert.equal(templates.length, 4);
    assert.deepEqual(
      templates.map((template) => template.id),
      ["basic-5", "tutorial-7", "comparison", "quick-tip-3"]
    );
  });

  it("reports AI availability via /api/ai-status", async () => {
    class MockAiGeneratorError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    }

    const aiGenerator = {
      AiGeneratorError: MockAiGeneratorError,
      isAvailable: async () => false,
      generateSpec: async () => {
        throw new Error("not used");
      },
    };

    await withMockedServer(
      {
        "./src/ai-generator": aiGenerator,
        "./src/ai-generator.js": aiGenerator,
      },
      async (mockBaseUrl) => {
        const res = await fetch(mockBaseUrl + "/api/ai-status");
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { available: false });
      }
    );
  });

  it("returns generated draft specs from /api/generate", async () => {
    class MockAiGeneratorError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    }

    const calls = [];
    const aiGenerator = {
      AiGeneratorError: MockAiGeneratorError,
      isAvailable: async () => true,
      generateSpec: async (text, options) => {
        calls.push({ text, options });
        return GENERATED_SPEC;
      },
    };

    await withMockedServer(
      {
        "./src/ai-generator": aiGenerator,
        "./src/ai-generator.js": aiGenerator,
      },
      async (mockBaseUrl) => {
        const res = await fetch(mockBaseUrl + "/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: "Turn this article into a draft.",
            theme: "warm",
            generationOptions: {
              tone: "bold",
              density: "compact",
              intent: "compare",
              slideCount: 7,
            },
          }),
        });

        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { spec: GENERATED_SPEC });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].text, "Turn this article into a draft.");
        assert.equal(calls[0].options.theme, "warm");
        assert.deepEqual(calls[0].options.generationOptions, {
          tone: "bold",
          density: "compact",
          intent: "compare",
          slideCount: 7,
        });
      }
    );
  });

  it("rejects invalid generation options on /api/generate", async () => {
    class MockAiGeneratorError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    }

    const aiGenerator = {
      AiGeneratorError: MockAiGeneratorError,
      isAvailable: async () => true,
      generateSpec: async () => GENERATED_SPEC,
    };

    await withMockedServer(
      {
        "./src/ai-generator": aiGenerator,
        "./src/ai-generator.js": aiGenerator,
      },
      async (mockBaseUrl) => {
        const res = await fetch(mockBaseUrl + "/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: "Turn this article into a draft.",
            generationOptions: {
              tone: "chaotic",
            },
          }),
        });

        assert.equal(res.status, 400);
        assert.match(await res.text(), /generation tone/i);
      }
    );
  });

  it("rejects /api/generate requests without text", async () => {
    class MockAiGeneratorError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    }

    const aiGenerator = {
      AiGeneratorError: MockAiGeneratorError,
      isAvailable: async () => true,
      generateSpec: async () => GENERATED_SPEC,
    };

    await withMockedServer(
      {
        "./src/ai-generator": aiGenerator,
        "./src/ai-generator.js": aiGenerator,
      },
      async (mockBaseUrl) => {
        const res = await fetch(mockBaseUrl + "/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: "warm" }),
        });

        assert.equal(res.status, 400);
      }
    );
  });

  it("returns a slide variant from /api/generate-slide-variant", async () => {
    class MockAiGeneratorError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    }

    const calls = [];
    const aiGenerator = {
      AiGeneratorError: MockAiGeneratorError,
      isAvailable: async () => true,
      generateSpec: async () => GENERATED_SPEC,
      generateSlideVariant: async (spec, options) => {
        calls.push({ spec, options });
        return GENERATED_SLIDE_VARIANT;
      },
    };

    await withMockedServer(
      {
        "./src/ai-generator": aiGenerator,
        "./src/ai-generator.js": aiGenerator,
      },
      async (mockBaseUrl) => {
        const res = await fetch(mockBaseUrl + "/api/generate-slide-variant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spec: SLIDE_VARIANT_SPEC,
            slideIndex: 1,
            action: "suggest-layout",
            generationOptions: {
              tone: "bold",
              density: "balanced",
              intent: "compare",
              slideCount: 5,
            },
          }),
        });

        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { slide: GENERATED_SLIDE_VARIANT });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].options.slideIndex, 1);
        assert.equal(calls[0].options.action, "suggest-layout");
        assert.deepEqual(calls[0].options.generationOptions, {
          tone: "bold",
          density: "balanced",
          intent: "compare",
          slideCount: 5,
        });
      }
    );
  });

  it("rejects invalid slide actions on /api/generate-slide-variant", async () => {
    class MockAiGeneratorError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    }

    const aiGenerator = {
      AiGeneratorError: MockAiGeneratorError,
      isAvailable: async () => true,
      generateSpec: async () => GENERATED_SPEC,
      generateSlideVariant: async () => GENERATED_SLIDE_VARIANT,
    };

    await withMockedServer(
      {
        "./src/ai-generator": aiGenerator,
        "./src/ai-generator.js": aiGenerator,
      },
      async (mockBaseUrl) => {
        const res = await fetch(mockBaseUrl + "/api/generate-slide-variant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spec: SLIDE_VARIANT_SPEC,
            slideIndex: 1,
            action: "explode",
          }),
        });

        assert.equal(res.status, 400);
        assert.match(await res.text(), /unsupported slide action/i);
      }
    );
  });

  it("returns fetched article content from /api/fetch-url", async () => {
    class MockUrlFetchError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    }

    const calls = [];
    const urlFetcher = {
      UrlFetchError: MockUrlFetchError,
      fetchArticle: async (url) => {
        calls.push(url);
        return FETCHED_ARTICLE;
      },
    };

    await withMockedServer(
      {
        "./src/url-fetcher": urlFetcher,
        "./src/url-fetcher.js": urlFetcher,
      },
      async (mockBaseUrl) => {
        const res = await fetch(mockBaseUrl + "/api/fetch-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://example.com/story" }),
        });

        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), FETCHED_ARTICLE);
        assert.deepEqual(calls, ["https://example.com/story"]);
      }
    );
  });

  it("maps SSRF fetch-url failures to 403", async () => {
    class MockUrlFetchError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    }

    const urlFetcher = {
      UrlFetchError: MockUrlFetchError,
      fetchArticle: async () => {
        throw new MockUrlFetchError("FORBIDDEN_URL", "Blocked private network target");
      },
    };

    await withMockedServer(
      {
        "./src/url-fetcher": urlFetcher,
        "./src/url-fetcher.js": urlFetcher,
      },
      async (mockBaseUrl) => {
        const res = await fetch(mockBaseUrl + "/api/fetch-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://example.com/internal" }),
        });

        assert.equal(res.status, 403);
        const data = await res.json();
        assert.match(data.error, /blocked|private|forbidden|ssrf/i);
      }
    );
  });

  it("rejects /api/fetch-url requests without a url", async () => {
    class MockUrlFetchError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    }

    const urlFetcher = {
      UrlFetchError: MockUrlFetchError,
      fetchArticle: async () => FETCHED_ARTICLE,
    };

    await withMockedServer(
      {
        "./src/url-fetcher": urlFetcher,
        "./src/url-fetcher.js": urlFetcher,
      },
      async (mockBaseUrl) => {
        const res = await fetch(mockBaseUrl + "/api/fetch-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        assert.equal(res.status, 400);
      }
    );
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

  it("rejects uppercase and spaces", () => {
    assert.throws(() => normalizeSpecSlug("Topic-Bad"), {
      message: "Invalid spec name",
    });
    assert.throws(() => normalizeSpecSlug("with spaces"), {
      message: "Invalid spec name",
    });
  });
});

describe("server editor api", () => {
  it("returns rendered slide files for an existing spec", async () => {
    const slug = findRenderedSlug();
    assert.ok(slug, "expected at least one rendered spec fixture");

    const res = await fetch(baseUrl + `/api/specs/${slug}/output`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.slug, slug);
    assert.ok(Array.isArray(data.slides));
    assert.ok(data.slides.length > 0);
    assert.match(data.slides[0], /^\d+\.png$/);
  });

  it("rejects invalid slugs on json route", async () => {
    const res = await fetch(baseUrl + "/api/specs/%2E%2E%2Fsecret/json");
    assert.equal(res.status, 400);
  });

  it("creates a new spec from the default skeleton and rejects duplicates", async () => {
    const slug = makeSlug("worker2-create");
    cleanupSpecArtifacts(slug);

    try {
      const createRes = await fetch(baseUrl + "/api/specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });

      assert.equal(createRes.status, 201);
      assert.deepEqual(await createRes.json(), { ok: true, slug });
      assert.equal(fs.existsSync(specPath(slug)), true);

      const getRes = await fetch(baseUrl + `/api/specs/${slug}/json`);
      assert.equal(getRes.status, 200);

      const createdSpec = await getRes.json();
      assert.equal(createdSpec.meta.title, "New Card News");
      assert.equal(createdSpec.meta.subtitle, "Subtitle");
      assert.equal(createdSpec.meta.total_slides, 2);
      assert.equal(createdSpec.slides.length, 2);
      assert.deepEqual(createdSpec.slides.map((slide) => slide.layout), ["cover", "closing"]);
      assert.deepEqual(createdSpec.slides.map((slide) => slide.title), ["New Card News", "Summary"]);

      const duplicateRes = await fetch(baseUrl + "/api/specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });

      assert.equal(duplicateRes.status, 409);
    } finally {
      cleanupSpecArtifacts(slug);
    }
  });

  it("rejects invalid slugs on create", async () => {
    for (const slug of ["../evil", "Topic-Bad", "with spaces"]) {
      const res = await fetch(baseUrl + "/api/specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /invalid spec name/i);
    }
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

  it("rejects unknown block types during save validation", async () => {
    const slug = makeSlug("worker2-unknown-block");
    cleanupSpecArtifacts(slug);

    try {
      const createRes = await fetch(baseUrl + "/api/specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      assert.equal(createRes.status, 201);

      const saveRes = await fetch(baseUrl + `/api/specs/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meta: { title: "Demo", total_slides: 1 },
          slides: [
            {
              slide: 1,
              layout: "cover",
              title: "Slide 1",
              blocks: [{ type: "mystery-block" }],
            },
          ],
        }),
      });

      assert.equal(saveRes.status, 400);
      const data = await saveRes.json();
      assert.match(data.error, /validation issue/i);
      assert.ok(Array.isArray(data.validation));
      assert.ok(data.validation.some((issue) => /unknown type/i.test(issue.message)));
    } finally {
      cleanupSpecArtifacts(slug);
    }
  });

  it("deletes a spec and cleans up rendered output", async () => {
    const slug = makeSlug("worker2-delete");
    cleanupSpecArtifacts(slug);

    try {
      const createRes = await fetch(baseUrl + "/api/specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      assert.equal(createRes.status, 201);

      fs.mkdirSync(outputPath(slug), { recursive: true });
      fs.writeFileSync(path.join(outputPath(slug), "01.png"), "png");
      assert.equal(fs.existsSync(specPath(slug)), true);
      assert.equal(fs.existsSync(outputPath(slug)), true);

      const deleteRes = await fetch(baseUrl + `/api/specs/${slug}`, {
        method: "DELETE",
      });

      assert.equal(deleteRes.status, 200);
      assert.deepEqual(await deleteRes.json(), { ok: true });
      assert.equal(fs.existsSync(specPath(slug)), false);
      assert.equal(fs.existsSync(outputPath(slug)), false);

      const getRes = await fetch(baseUrl + `/api/specs/${slug}/json`);
      assert.equal(getRes.status, 404);
    } finally {
      cleanupSpecArtifacts(slug);
    }
  });
});
