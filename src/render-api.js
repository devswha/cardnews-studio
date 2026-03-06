const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const { parseSpec } = require("./parser");
const TemplateEngine = require("./template-engine");
const Renderer = require("./renderer");
const { renderBlock } = require("./blocks");
const { fileToDataUri, safePath } = require("./utils/mime");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const ASSETS_DIR = path.resolve(PROJECT_ROOT, "assets");
const SPECS_DIR = path.resolve(PROJECT_ROOT, "specs");
const STYLES_DIR = path.resolve(PROJECT_ROOT, "styles");
const TEMPLATES_DIR = path.resolve(PROJECT_ROOT, "templates");
const OUTPUT_DIR = path.resolve(PROJECT_ROOT, "output");

function resolveIconUrl(iconUrl) {
  if (!iconUrl || iconUrl.startsWith("data:") || iconUrl.startsWith("http")) {
    return iconUrl;
  }
  try {
    const imgPath = safePath(ASSETS_DIR, iconUrl);
    return fileToDataUri(imgPath);
  } catch (err) {
    console.warn(`[warn] Icon load failed (${iconUrl}): ${err.message}`);
    return iconUrl;
  }
}

function resolveBlockAssets(blocks) {
  for (const block of blocks) {
    if (block.type === "before-after") {
      if (block.before?.icon_url) block.before.icon_url = resolveIconUrl(block.before.icon_url);
      if (block.after?.icon_url) block.after.icon_url = resolveIconUrl(block.after.icon_url);
    }
  }
}

function resolveSlideAssets(slide) {
  if (slide.subtitle_icon) {
    slide.subtitle_icon_uri = resolveIconUrl(slide.subtitle_icon);
  }
}

function renderBlocks(blocks, slideNumber) {
  return blocks
    .map((block, index) => {
      try {
        return renderBlock(block);
      } catch (error) {
        const blockType = block && block.type ? block.type : "unknown";
        throw new Error(
          `Failed block render on slide ${slideNumber} (#${index + 1}, ${blockType}): ${error.message}`
        );
      }
    })
    .join("\n");
}

async function renderSpec(yamlPath, options = {}) {
  const { theme = null, onProgress = null, slideNumbers = null } = options;
  const { meta, slides } = await parseSpec(yamlPath);

  if (!slides.length) {
    throw new Error("No slides found in YAML spec");
  }

  const resolvedTheme = theme || meta.theme || null;
  const templateEngine = new TemplateEngine({
    templatesDir: TEMPLATES_DIR,
    stylesDir: STYLES_DIR,
    theme: resolvedTheme,
  });
  await templateEngine.load();

  const totalSlides = meta.total_slides || slides.length;
  const renderJobs = [];

  for (const slide of slides) {
    resolveSlideAssets(slide);
    resolveBlockAssets(slide.blocks);
    const blocksHtml = renderBlocks(slide.blocks, slide.slide);
    const html = await templateEngine.renderSlide({
      meta,
      slide,
      blocksHtml,
      totalSlides,
    });
    renderJobs.push({ slideNumber: slide.slide, html });
  }

  const slug = path.basename(yamlPath, path.extname(yamlPath));
  const outputDir = path.resolve(OUTPUT_DIR, slug);
  await fsPromises.mkdir(outputDir, { recursive: true });

  // Per-slide rendering with progress callback
  // Bypasses Renderer.renderSlides() to insert onProgress between slides
  const renderer = new Renderer();
  const outputPaths = [];

  try {
    await renderer.init();
    const page = await renderer.browser.newPage();
    await page.setViewport({
      width: renderer.width,
      height: renderer.height,
      deviceScaleFactor: renderer.deviceScaleFactor,
    });

    const jobsToRender = slideNumbers
      ? renderJobs.filter((j) => slideNumbers.includes(j.slideNumber))
      : renderJobs;

    try {
      for (const job of jobsToRender) {
        const fileName = `${String(job.slideNumber).padStart(2, "0")}.png`;
        const outputPath = path.join(outputDir, fileName);

        await page.setContent(job.html, { waitUntil: "domcontentloaded", timeout: 10000 });
        await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch((err) => {
          console.warn(`[warn] Network idle timeout on slide ${job.slideNumber}: ${err.message}`);
        });
        await renderer.waitForFonts(page);
        await renderer.checkOverflow(page, job.slideNumber);
        await page.screenshot({ path: outputPath, type: "png" });

        outputPaths.push(outputPath);
        if (onProgress) {
          onProgress(job.slideNumber, totalSlides);
        }
      }
    } finally {
      await page.close();
    }
  } finally {
    await renderer.close();
  }

  return { slug, outputDir, outputPaths, totalSlides, meta };
}

async function listSpecs() {
  const files = await fsPromises.readdir(SPECS_DIR);
  const yamlFiles = files.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml")).sort();
  const results = [];

  for (const file of yamlFiles) {
    const filePath = path.resolve(SPECS_DIR, file);
    try {
      const { meta } = await parseSpec(filePath);
      const slug = path.basename(file, path.extname(file));
      const outputSlides = listOutputSlides(slug);
      const outputExists = outputSlides.length > 0;
      results.push({
        name: file,
        slug,
        path: filePath,
        title: meta.title || slug,
        theme: meta.theme || null,
        totalSlides: meta.total_slides || 0,
        hasOutput: outputExists,
        outputSlides,
      });
    } catch (err) {
      console.warn(`[warn] Failed to parse spec ${file}: ${err.message}`);
    }
  }

  return results;
}

function listThemes() {
  const themesDir = path.resolve(STYLES_DIR, "themes");
  try {
    return fs
      .readdirSync(themesDir)
      .filter((f) => f.endsWith(".css"))
      .map((f) => path.basename(f, ".css"))
      .sort();
  } catch {
    return [];
  }
}

function listOutputSlides(slug) {
  const specOutputDir = path.resolve(OUTPUT_DIR, path.basename(slug));

  try {
    return fs
      .readdirSync(specOutputDir)
      .filter((name) => /^\d+\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

module.exports = { renderSpec, listSpecs, listThemes, listOutputSlides };
