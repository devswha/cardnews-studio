const fs = require("fs/promises");
const path = require("path");
const Handlebars = require("handlebars");
const { fileToDataUriAsync, safePath } = require("./utils/mime");

const REQUIRED_TEMPLATES = ["cover", "content", "closing"];
const OPTIONAL_TEMPLATES = ["base"];
const STYLE_FILES = ["tokens.css", "base.css", "layouts.css", "components.css"];

function templateNameForLayout(layout) {
  if (layout === "cover") {
    return "cover";
  }
  if (layout === "closing") {
    return "closing";
  }
  return "content";
}

class TemplateEngine {
  constructor(options = {}) {
    this.templatesDir = options.templatesDir || path.resolve(__dirname, "../templates");
    this.stylesDir = options.stylesDir || path.resolve(__dirname, "../styles");
    this.theme = options.theme || null;
    this.templates = {};
    this.stylesCss = "";
    this.loaded = false;
  }

  async load() {
    if (this.loaded) {
      return;
    }

    this.stylesCss = await this.loadStyles();

    for (const name of OPTIONAL_TEMPLATES) {
      await this.loadTemplate(name, false);
    }
    for (const name of REQUIRED_TEMPLATES) {
      await this.loadTemplate(name, true);
    }

    this.loaded = true;
  }

  async loadTemplate(name, required) {
    const filePath = path.join(this.templatesDir, `${name}.html`);
    try {
      const source = await fs.readFile(filePath, "utf8");
      this.templates[name] = Handlebars.compile(source);
    } catch (error) {
      if (required || error.code !== "ENOENT") {
        throw new Error(`Template load failed (${name}.html): ${error.message}`);
      }
    }
  }

  async loadStyles() {
    const chunks = [];
    for (const fileName of STYLE_FILES) {
      const filePath = path.join(this.stylesDir, fileName);
      try {
        chunks.push(await fs.readFile(filePath, "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }

    if (this.theme) {
      const themePath = path.join(this.stylesDir, "themes", `${this.theme}.css`);
      try {
        chunks.push(await fs.readFile(themePath, "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") {
          throw new Error(`Theme not found: ${this.theme} (expected at themes/${this.theme}.css)`);
        }
        throw error;
      }
    }

    return chunks.join("\n");
  }

  async resolveIllustration(meta) {
    if (!meta.cover_illustration) return meta;
    const illustrationsDir = path.resolve(process.cwd(), "assets", "illustrations");
    try {
      const imgPath = safePath(illustrationsDir, meta.cover_illustration);
      const uri = await fileToDataUriAsync(imgPath);
      return { ...meta, cover_illustration_uri: uri };
    } catch (err) {
      console.warn(`[warn] Illustration load failed (${meta.cover_illustration}): ${err.message}`);
      return meta;
    }
  }

  buildContext({ meta, slide, blocksHtml, totalSlides }) {
    const slideNumber = slide.slide;
    return {
      meta,
      slide,
      blocksHtml,
      blocks_html: blocksHtml,
      totalSlides,
      total_slides: totalSlides,
      slideNumber,
      slide_number: slideNumber,
      pageLabel: `${String(slideNumber).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}`,
      page_label: `${String(slideNumber).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}`,
      stylesCss: this.stylesCss,
      styles_css: this.stylesCss,
    };
  }

  wrapFallbackHtml(slideHtml, context) {
    const title = Handlebars.escapeExpression(context.slide.title || context.meta.title || "Card News");
    return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>${context.stylesCss || ""}</style>
  </head>
  <body>
    ${slideHtml}
  </body>
</html>`;
  }

  async renderSlide({ meta, slide, blocksHtml, totalSlides }) {
    await this.load();

    const layoutTemplateName = templateNameForLayout(slide.layout);
    const template = this.templates[layoutTemplateName];

    if (!template) {
      throw new Error(`No template compiled for layout "${slide.layout}"`);
    }

    const resolvedMeta = await this.resolveIllustration(meta);
    const context = this.buildContext({ meta: resolvedMeta, slide, blocksHtml, totalSlides });
    const slideHtml = template(context);

    if (this.templates.base) {
      return this.templates.base({
        ...context,
        body: slideHtml,
        content: slideHtml,
        slideHtml,
        slide_html: slideHtml,
      });
    }

    return this.wrapFallbackHtml(slideHtml, context);
  }
}

module.exports = TemplateEngine;
