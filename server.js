#!/usr/bin/env node

const path = require("path");
const fs = require("fs");

// Enforce cwd to repo root for transitive process.cwd() calls
// (template-engine.js:88 uses process.cwd() for illustration resolution)
process.chdir(path.resolve(__dirname));

const express = require("express");
const yaml = require("js-yaml");
const { renderSpec, listSpecs, listThemes, listOutputSlides } = require("./src/render-api");
const SpecValidation = require("./public/spec-validation.js");
const { getBlockSchemas } = require("./src/block-schemas");
const { TEMPLATE_PRESETS } = require("./src/template-presets");
const {
  generateSpec,
  generateSlideVariant,
  generateSlideVariants,
  isAvailable: isAiAvailable,
  MAX_INPUT_LENGTH: MAX_GENERATE_TEXT_LENGTH,
} = require("./src/ai-generator");
const { fetchArticle } = require("./src/url-fetcher");

const SPECS_DIR = path.resolve(__dirname, "specs");
const OUTPUT_DIR = path.resolve(__dirname, "output");
const SPEC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BLOCK_SCHEMAS = getBlockSchemas();
const API_TEMPLATE_PRESETS = buildTemplatePayloads();
const AI_TONE_OPTIONS = ["professional", "playful", "bold", "technical"];
const AI_DENSITY_OPTIONS = ["compact", "balanced", "detailed"];
const AI_INTENT_OPTIONS = ["awareness", "explain", "compare", "action"];
const AI_SLIDE_COUNT_OPTIONS = [3, 5, 7];
const AI_SLIDE_ACTIONS = ["rewrite", "shorten", "punch-up", "suggest-layout"];
const AI_SLIDE_VARIANT_COUNT_MAX = 3;

function normalizeSpecSlug(rawSlug) {
  if (typeof rawSlug !== "string" || !SPEC_SLUG_PATTERN.test(rawSlug)) {
    throw new Error("Invalid spec name");
  }
  return rawSlug;
}

function createDefaultSpec() {
  return {
    meta: {
      title: "New Card News",
      subtitle: "Subtitle",
      total_slides: 2,
    },
    slides: [
      {
        slide: 1,
        layout: "cover",
        title: "New Card News",
        subtitle: "Subtitle",
        blocks: [],
      },
      {
        slide: 2,
        layout: "closing",
        title: "Summary",
        blocks: [],
      },
    ],
  };
}

function toYamlContent(specObject) {
  return yaml.dump(specObject, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
}

function cloneValue(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeOptionalTheme(rawTheme) {
  if (rawTheme == null) {
    return null;
  }

  if (typeof rawTheme !== "string") {
    throw new Error("Theme must be a string.");
  }

  const safeTheme = rawTheme.trim();
  if (!safeTheme) {
    return null;
  }

  if (!listThemes().includes(safeTheme)) {
    throw new Error(`Unknown theme: ${safeTheme}`);
  }

  return safeTheme;
}

function normalizeGenerateOptions(rawOptions) {
  const source = rawOptions && typeof rawOptions === "object" && !Array.isArray(rawOptions)
    ? rawOptions
    : {};
  const result = {};

  if (source.tone != null) {
    const tone = String(source.tone).trim().toLowerCase();
    if (!AI_TONE_OPTIONS.includes(tone)) {
      throw new Error(`Unknown generation tone: ${source.tone}`);
    }
    result.tone = tone;
  }

  if (source.density != null) {
    const density = String(source.density).trim().toLowerCase();
    if (!AI_DENSITY_OPTIONS.includes(density)) {
      throw new Error(`Unknown generation density: ${source.density}`);
    }
    result.density = density;
  }

  if (source.intent != null) {
    const intent = String(source.intent).trim().toLowerCase();
    if (!AI_INTENT_OPTIONS.includes(intent)) {
      throw new Error(`Unknown generation intent: ${source.intent}`);
    }
    result.intent = intent;
  }

  if (source.slideCount != null) {
    const slideCount = Number(source.slideCount);
    if (!AI_SLIDE_COUNT_OPTIONS.includes(slideCount)) {
      throw new Error(`Unsupported slide count: ${source.slideCount}`);
    }
    result.slideCount = slideCount;
  }

  return result;
}

function normalizeSlideAction(rawAction) {
  const action = String(rawAction || "").trim().toLowerCase();
  if (!AI_SLIDE_ACTIONS.includes(action)) {
    throw new Error(`Unsupported slide action: ${rawAction}`);
  }
  return action;
}

function normalizeSlideVariantCount(rawCount) {
  const count = rawCount == null ? AI_SLIDE_VARIANT_COUNT_MAX : Number(rawCount);
  if (!Number.isInteger(count) || count < 1 || count > AI_SLIDE_VARIANT_COUNT_MAX) {
    throw new Error(`Variant count must be between 1 and ${AI_SLIDE_VARIANT_COUNT_MAX}.`);
  }
  return count;
}

function buildTemplatePayloads() {
  return TEMPLATE_PRESETS.map((template) => {
    const spec = cloneValue(template.spec || {});
    const validation = SpecValidation.validateSpec(spec, BLOCK_SCHEMAS);
    if (!validation.valid) {
      throw new Error(
        `Invalid template preset "${template.id || template.label || "unknown"}": ${SpecValidation.summarize(validation)}`
      );
    }

    return {
      id: template.id,
      label: template.label,
      name: template.label,
      description: template.description,
      slideCount: template.slideCount || (Array.isArray(spec.slides) ? spec.slides.length : 0),
      layouts: Array.isArray(spec.slides) ? spec.slides.map((slide) => slide.layout) : [],
      spec,
    };
  });
}

function statusForAiError(error) {
  switch (error && error.code) {
    case "ERR_AI_INPUT_REQUIRED":
    case "ERR_AI_INPUT_TOO_LONG":
    case "ERR_AI_UNSUPPORTED_BACKEND":
    case "ERR_AI_SPEC_REQUIRED":
    case "ERR_AI_ACTION_INVALID":
    case "ERR_AI_SLIDE_INDEX":
    case "ERR_AI_VARIANT_COUNT":
      return 400;
    case "ERR_AI_UNAVAILABLE":
      return 503;
    case "ERR_AI_TIMEOUT":
      return 504;
    case "ERR_AI_PROCESS_EXIT":
    case "ERR_AI_PROCESS_START":
    case "ERR_AI_OUTPUT":
    case "ERR_AI_OUTPUT_EMPTY":
    case "ERR_AI_VALIDATION":
      return 502;
    default:
      return 500;
  }
}

function statusForUrlError(error) {
  switch (error && error.code) {
    case "ERR_URL_REQUIRED":
    case "ERR_URL_INVALID":
    case "ERR_URL_PROTOCOL":
    case "INVALID_URL":
      return 400;
    case "ERR_URL_PRIVATE_IP":
    case "FORBIDDEN_URL":
      return 403;
    case "ERR_FETCH_TIMEOUT":
    case "ERR_FETCH_FAILED":
    case "ERR_FETCH_REDIRECTS":
    case "ERR_URL_RESOLVE":
    case "TIMEOUT":
    case "FETCH_FAILED":
    case "BAD_RESPONSE":
    case "TOO_MANY_REDIRECTS":
    case "DNS_LOOKUP_FAILED":
      return 502;
    default:
      return 500;
  }
}

function toErrorPayload(error) {
  const payload = {
    error: error && error.message ? error.message : "Unexpected error.",
  };

  if (error && Array.isArray(error.validation) && error.validation.length) {
    payload.validation = error.validation;
  }

  return payload;
}

function createApp() {
  const app = express();
  let renderLock = Promise.resolve();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use("/vendor/sortablejs", express.static(path.join(__dirname, "node_modules", "sortablejs")));
  app.use(express.static(path.join(__dirname, "public")));

  // Serve rendered PNGs with no-cache
  app.use(
    "/output",
    express.static(path.join(__dirname, "output"), {
      setHeaders(res) {
        res.set("Cache-Control", "no-cache");
      },
    })
  );

  // API: List specs
  app.get("/api/specs", async (req, res) => {
    try {
      const specs = await listSpecs();
      res.json(specs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: List themes
  app.get("/api/themes", (req, res) => {
    try {
      const themes = listThemes();
      res.json(themes);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/ai-status", async (req, res) => {
    try {
      res.json({
        available: await isAiAvailable(),
      });
    } catch {
      res.json({ available: false });
    }
  });

  app.get("/api/templates", (req, res) => {
    try {
      res.json(cloneValue(API_TEMPLATE_PRESETS));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/generate", async (req, res) => {
    const body =
      req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)
        ? req.body
        : {};
    if (typeof body.text !== "string" || !body.text.trim()) {
      return res.status(400).json({ error: "Text is required." });
    }

    if (body.text.length > MAX_GENERATE_TEXT_LENGTH) {
      return res.status(400).json({
        error: `Text must be ${MAX_GENERATE_TEXT_LENGTH.toLocaleString("en-US")} characters or fewer.`,
      });
    }

    let theme;
    let generationOptions;
    try {
      theme = normalizeOptionalTheme(body.theme);
      generationOptions = normalizeGenerateOptions(body.generationOptions);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const spec = await generateSpec(body.text, {
        blockSchemas: BLOCK_SCHEMAS,
        theme,
        generationOptions,
      });
      res.json({ spec });
    } catch (err) {
      res.status(statusForAiError(err)).json(toErrorPayload(err));
    }
  });

  app.post("/api/generate-slide-variant", async (req, res) => {
    const body =
      req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)
        ? req.body
        : {};

    if (!body.spec || typeof body.spec !== "object" || Array.isArray(body.spec)) {
      return res.status(400).json({ error: "Spec is required." });
    }

    const slideIndex = Number(body.slideIndex);
    if (!Number.isInteger(slideIndex)) {
      return res.status(400).json({ error: "slideIndex must be an integer." });
    }

    let action;
    let generationOptions;
    try {
      action = normalizeSlideAction(body.action);
      generationOptions = normalizeGenerateOptions(body.generationOptions);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const validation = SpecValidation.validateSpec(body.spec, BLOCK_SCHEMAS);
    if (!validation.valid) {
      return res.status(400).json({
        error: SpecValidation.summarize(validation),
        validation: validation.errors,
      });
    }

    if (slideIndex < 0 || slideIndex >= body.spec.slides.length) {
      return res.status(400).json({ error: "slideIndex is out of range." });
    }

    try {
      const slide = await generateSlideVariant(body.spec, {
        slideIndex,
        action,
        blockSchemas: BLOCK_SCHEMAS,
        generationOptions,
      });
      res.json({ slide });
    } catch (err) {
      res.status(statusForAiError(err)).json(toErrorPayload(err));
    }
  });

  app.post("/api/generate-slide-variants", async (req, res) => {
    const body =
      req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)
        ? req.body
        : {};

    if (!body.spec || typeof body.spec !== "object" || Array.isArray(body.spec)) {
      return res.status(400).json({ error: "Spec is required." });
    }

    const slideIndex = Number(body.slideIndex);
    if (!Number.isInteger(slideIndex)) {
      return res.status(400).json({ error: "slideIndex must be an integer." });
    }

    let action;
    let generationOptions;
    let variantCount;
    try {
      action = normalizeSlideAction(body.action);
      generationOptions = normalizeGenerateOptions(body.generationOptions);
      variantCount = normalizeSlideVariantCount(body.count);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const validation = SpecValidation.validateSpec(body.spec, BLOCK_SCHEMAS);
    if (!validation.valid) {
      return res.status(400).json({
        error: SpecValidation.summarize(validation),
        validation: validation.errors,
      });
    }

    if (slideIndex < 0 || slideIndex >= body.spec.slides.length) {
      return res.status(400).json({ error: "slideIndex is out of range." });
    }

    try {
      const variants = await generateSlideVariants(body.spec, {
        slideIndex,
        action,
        blockSchemas: BLOCK_SCHEMAS,
        generationOptions,
        variantCount,
      });
      res.json({ variants });
    } catch (err) {
      res.status(statusForAiError(err)).json(toErrorPayload(err));
    }
  });

  app.post("/api/fetch-url", async (req, res) => {
    const body =
      req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)
        ? req.body
        : {};
    if (typeof body.url !== "string" || !body.url.trim()) {
      return res.status(400).json({ error: "URL is required." });
    }

    try {
      res.json(await fetchArticle(body.url));
    } catch (err) {
      res.status(statusForUrlError(err)).json(toErrorPayload(err));
    }
  });

  // API: Create spec
  app.post("/api/specs", (req, res) => {
    const payload =
      req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)
        ? req.body
        : {};

    let safeSlug;
    try {
      safeSlug = normalizeSpecSlug(payload.slug);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    if (
      payload.spec !== undefined &&
      (!payload.spec || typeof payload.spec !== "object" || Array.isArray(payload.spec))
    ) {
      return res.status(400).json({ error: "Invalid spec payload" });
    }

    const yamlPath = path.resolve(SPECS_DIR, safeSlug + ".yaml");
    if (fs.existsSync(yamlPath)) {
      return res.status(409).json({ error: "Spec already exists" });
    }

    try {
      const specObject = payload.spec || createDefaultSpec();
      const validation = SpecValidation.validateSpec(specObject, BLOCK_SCHEMAS);

      if (!validation.valid) {
        return res.status(400).json({
          error: SpecValidation.summarize(validation),
          validation: validation.errors,
        });
      }

      fs.writeFileSync(yamlPath, toYamlContent(specObject), {
        encoding: "utf8",
        flag: "wx",
      });
      res.status(201).json({ ok: true, slug: safeSlug });
    } catch (err) {
      if (err && err.code === "EEXIST") {
        return res.status(409).json({ error: "Spec already exists" });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // API: Read spec YAML content
  app.get("/api/specs/:slug", (req, res) => {
    let safeSlug;
    try {
      safeSlug = normalizeSpecSlug(req.params.slug);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const yamlPath = path.resolve(SPECS_DIR, safeSlug + ".yaml");
    if (!fs.existsSync(yamlPath)) {
      return res.status(404).json({ error: "Spec not found" });
    }
    try {
      const content = fs.readFileSync(yamlPath, "utf8");
      res.type("text/yaml").send(content);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: Read spec as parsed JSON (raw yaml.load, NOT parseSpec — preserves all fields)
  app.get("/api/specs/:slug/json", (req, res) => {
    let safeSlug;
    try {
      safeSlug = normalizeSpecSlug(req.params.slug);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const yamlPath = path.resolve(SPECS_DIR, safeSlug + ".yaml");
    if (!fs.existsSync(yamlPath)) {
      return res.status(404).json({ error: "Spec not found" });
    }
    try {
      const content = fs.readFileSync(yamlPath, "utf8");
      const raw = yaml.load(content);
      res.json(raw);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/specs/:slug/output", (req, res) => {
    let safeSlug;
    try {
      safeSlug = normalizeSpecSlug(req.params.slug);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      res.json({
        slug: safeSlug,
        slides: listOutputSlides(safeSlug),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: Save spec (accepts JSON or YAML body)
  app.put("/api/specs/:slug", express.text({ type: "text/*", limit: "1mb" }), (req, res) => {
    let safeSlug;
    try {
      safeSlug = normalizeSpecSlug(req.params.slug);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const yamlPath = path.resolve(SPECS_DIR, safeSlug + ".yaml");
    if (!fs.existsSync(yamlPath)) {
      return res.status(404).json({ error: "Spec not found" });
    }
    try {
      let yamlContent;
      let specObject;
      if (typeof req.body === "object" && req.body !== null && !Buffer.isBuffer(req.body)) {
        // Parsed by express.json() — convert object to YAML
        specObject = req.body;
        yamlContent = toYamlContent(req.body);
      } else {
        // Raw string (YAML body)
        yamlContent = typeof req.body === "string" ? req.body : req.body.toString("utf8");
        specObject = yaml.load(yamlContent);
      }

      const validation = SpecValidation.validateSpec(specObject, BLOCK_SCHEMAS);
      if (!validation.valid) {
        return res.status(400).json({
          error: SpecValidation.summarize(validation),
          validation: validation.errors,
        });
      }

      fs.writeFileSync(yamlPath, yamlContent, "utf8");
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // API: Delete spec and rendered output
  app.delete("/api/specs/:slug", (req, res) => {
    let safeSlug;
    try {
      safeSlug = normalizeSpecSlug(req.params.slug);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const yamlPath = path.resolve(SPECS_DIR, safeSlug + ".yaml");
    if (!fs.existsSync(yamlPath)) {
      return res.status(404).json({ error: "Spec not found" });
    }

    try {
      fs.unlinkSync(yamlPath);
      fs.rmSync(path.resolve(OUTPUT_DIR, safeSlug), {
        recursive: true,
        force: true,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: Render a single slide (JSON response)
  app.post("/api/render-slide", (req, res) => {
    const { spec, slideNumber, theme } = req.body || {};

    if (!spec || typeof spec !== "string" || !slideNumber) {
      return res.status(400).json({ error: "Missing spec or slideNumber" });
    }

    let safeSpec;
    try {
      safeSpec = normalizeSpecSlug(spec);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const yamlPath = path.resolve(SPECS_DIR, safeSpec + ".yaml");
    if (!fs.existsSync(yamlPath)) {
      return res.status(404).json({ error: `Spec not found: ${safeSpec}` });
    }

    renderLock = renderLock
      .then(() =>
        renderSpec(yamlPath, {
          theme: theme || null,
          slideNumbers: [slideNumber],
        })
      )
      .then((result) => {
        if (!res.headersSent) {
          const fileName = String(slideNumber).padStart(2, "0") + ".png";
          res.json({ png: `/output/${result.slug}/${fileName}` });
        }
      })
      .catch((err) => {
        console.error("[render-slide] render failed:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: err.message });
        }
      });
  });

  // API: Render spec (SSE progress stream)
  app.post("/api/render", (req, res) => {
    const { spec, theme } = req.body || {};

    if (!spec || typeof spec !== "string") {
      return res.status(400).json({ error: "Missing spec parameter" });
    }

    let safeSpec;
    try {
      safeSpec = normalizeSpecSlug(spec);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const yamlPath = path.resolve(SPECS_DIR, safeSpec + ".yaml");

    if (!fs.existsSync(yamlPath)) {
      return res.status(404).json({ error: `Spec not found: ${safeSpec}` });
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Chain onto render lock for serialization
    renderLock = renderLock
      .then(() =>
        renderSpec(yamlPath, {
          theme: theme || null,
          onProgress(slide, total) {
            if (!res.writableEnded) {
              res.write(`event: progress\ndata: ${JSON.stringify({ slide, total })}\n\n`);
            }
          },
        })
      )
      .then((result) => {
        if (!res.writableEnded) {
          const slideFiles = result.outputPaths.map((p) => path.basename(p));
          res.write(
            `event: complete\ndata: ${JSON.stringify({
              slug: result.slug,
              slides: slideFiles,
              total: result.totalSlides,
            })}\n\n`
          );
          res.end();
        }
      })
      .catch((err) => {
        console.error("[render] render failed:", err);
        if (!res.writableEnded) {
          res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
          res.end();
        }
      });
  });

  return app;
}

function startServer(port = process.env.PORT || 3456) {
  const app = createApp();
  return app.listen(port, "0.0.0.0", () => {
    console.log(`Card News UI running at http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  normalizeSpecSlug,
  startServer,
};
