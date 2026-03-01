#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const { parseSpec } = require("./src/parser");
const TemplateEngine = require("./src/template-engine");
const Renderer = require("./src/renderer");
const { renderBlock } = require("./src/blocks");
const { fileToDataUri, safePath } = require("./src/utils/mime");

function getAvailableThemes() {
  const themesDir = path.resolve(__dirname, "styles/themes");
  try {
    return fs.readdirSync(themesDir)
      .filter(f => f.endsWith(".css"))
      .map(f => path.basename(f, ".css"));
  } catch {
    return [];
  }
}

function printUsage() {
  const version = require("./package.json").version;
  const themes = getAvailableThemes();
  const themeList = themes.length ? themes.join(", ") : "none";
  console.log(`
cardnews v${version} - YAML to card-news PNG renderer

Usage:
  cardnews <yaml-path> [options]

Options:
  --slide N       Render only slide N
  --theme NAME    Apply theme (available: ${themeList})
  --help, -h      Show this help
  --version, -v   Show version

Examples:
  cardnews examples/hello.yaml
  cardnews spec.yaml --theme 8bit
  cardnews spec.yaml --slide 3

Output: output/{slug}/01.png ~ NN.png (1080x1350 @2x)
`.trim());
}

function parseSlideNumber(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid --slide value: ${value}`);
  }
  return parsed;
}

function parseArgs(argv) {
  if (argv.length < 1) {
    printUsage();
    process.exit(1);
  }

  let yamlPath = null;
  let slideNumber = null;
  let theme = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--version" || arg === "-v") {
      console.log(require("./package.json").version);
      process.exit(0);
    }

    if (!arg.startsWith("--") && yamlPath === null) {
      yamlPath = arg;
      continue;
    }

    if (arg === "--slide") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --slide");
      }
      slideNumber = parseSlideNumber(value);
      i += 1;
      continue;
    }

    if (arg.startsWith("--slide=")) {
      slideNumber = parseSlideNumber(arg.slice("--slide=".length));
      continue;
    }

    if (arg === "--theme") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --theme");
      }
      theme = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--theme=")) {
      theme = arg.slice("--theme=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!yamlPath) {
    printUsage();
    process.exit(1);
  }

  return { yamlPath, slideNumber, theme };
}

function resolveSlideSelection(slides, slideNumber) {
  if (slideNumber === null) {
    return slides;
  }

  const match = slides.find((slide) => slide.slide === slideNumber);
  if (!match) {
    const available = slides.map((s) => s.slide).join(", ");
    throw new Error(`Slide ${slideNumber} not found. Available: ${available}`);
  }
  return [match];
}

function resolveIconUrl(iconUrl) {
  if (!iconUrl || iconUrl.startsWith("data:") || iconUrl.startsWith("http")) {
    return iconUrl;
  }
  const assetsDir = path.resolve(process.cwd(), "assets");
  try {
    const imgPath = safePath(assetsDir, iconUrl);
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

async function main() {
  const { yamlPath, slideNumber, theme } = parseArgs(process.argv.slice(2));
  const absoluteYamlPath = path.resolve(process.cwd(), yamlPath);

  if (!fs.existsSync(absoluteYamlPath)) {
    throw new Error(`File not found: ${absoluteYamlPath}`);
  }

  const { meta, slides } = await parseSpec(absoluteYamlPath);

  if (!slides.length) {
    throw new Error("No slides found in YAML spec");
  }

  const selectedSlides = resolveSlideSelection(slides, slideNumber);
  const resolvedTheme = theme || meta.theme || null;
  const templateEngine = new TemplateEngine({
    templatesDir: path.resolve(__dirname, "templates"),
    stylesDir: path.resolve(__dirname, "styles"),
    theme: resolvedTheme,
  });
  await templateEngine.load();

  const totalSlides = meta.total_slides || slides.length;
  const renderJobs = [];

  for (const slide of selectedSlides) {
    resolveSlideAssets(slide);
    resolveBlockAssets(slide.blocks);
    const blocksHtml = renderBlocks(slide.blocks, slide.slide);
    const html = await templateEngine.renderSlide({
      meta,
      slide,
      blocksHtml,
      totalSlides,
    });
    renderJobs.push({
      slideNumber: slide.slide,
      html,
    });
  }

  const slug = path.basename(absoluteYamlPath, path.extname(absoluteYamlPath));
  const outputDir = path.resolve(process.cwd(), "output", slug);
  const renderer = new Renderer();

  try {
    const outputPaths = await renderer.renderSlides(renderJobs, outputDir);
    if (slideNumber !== null) {
      console.log(`Rendered slide ${slideNumber} → ${outputPaths[0]}`);
    } else {
      console.log(`Rendered ${outputPaths.length} slides → ${outputDir}/`);
    }
  } finally {
    await renderer.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
