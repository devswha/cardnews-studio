#!/usr/bin/env node

const path = require("path");
const fs = require("fs");

// Enforce cwd to card-news/ for transitive process.cwd() calls
// (template-engine.js:88 uses process.cwd() for illustration resolution)
process.chdir(path.resolve(__dirname));

const express = require("express");
const yaml = require("js-yaml");
const { renderSpec, listSpecs, listThemes, listOutputSlides } = require("./src/render-api");
const SpecValidation = require("./public/spec-validation.js");

function normalizeSpecSlug(rawSlug) {
  const safeSlug = path.basename(rawSlug || "");
  if (!rawSlug || safeSlug !== rawSlug) {
    throw new Error("Invalid spec name");
  }
  return safeSlug;
}

function createApp() {
  const app = express();
  let renderLock = Promise.resolve();

  app.disable("x-powered-by");
  app.use(express.json());
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

  // API: Read spec YAML content
  app.get("/api/specs/:slug", (req, res) => {
    let safeSlug;
    try {
      safeSlug = normalizeSpecSlug(req.params.slug);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const yamlPath = path.resolve(__dirname, "specs", safeSlug + ".yaml");
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

    const yamlPath = path.resolve(__dirname, "specs", safeSlug + ".yaml");
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

    const yamlPath = path.resolve(__dirname, "specs", safeSlug + ".yaml");
    if (!fs.existsSync(yamlPath)) {
      return res.status(404).json({ error: "Spec not found" });
    }
    try {
      let yamlContent;
      let specObject;
      if (typeof req.body === "object" && req.body !== null && !Buffer.isBuffer(req.body)) {
        // Parsed by express.json() — convert object to YAML
        specObject = req.body;
        yamlContent = yaml.dump(req.body, {
          lineWidth: -1,
          noRefs: true,
          quotingType: '"',
          forceQuotes: false,
        });
      } else {
        // Raw string (YAML body)
        yamlContent = typeof req.body === "string" ? req.body : req.body.toString("utf8");
        specObject = yaml.load(yamlContent);
      }

      const validation = SpecValidation.validateSpec(specObject);
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

    const yamlPath = path.resolve(__dirname, "specs", safeSpec + ".yaml");
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

    const yamlPath = path.resolve(__dirname, "specs", safeSpec + ".yaml");

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
