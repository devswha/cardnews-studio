const fs = require("fs/promises");
const yaml = require("js-yaml");

const DEFAULT_SERIES = "claude-code-recipe";
const DEFAULT_AUTHOR = "Unknown Author";
const DEFAULT_AUTHOR_HANDLE = "@unknown";

function toStringOrDefault(value, defaultValue = "") {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  return String(value);
}

function toOptionalNumber(value, defaultValue = null) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeSlides(rawSlides) {
  if (!Array.isArray(rawSlides)) {
    return [];
  }

  const normalized = rawSlides.map((slide, index) => {
    const slideNumber = toOptionalNumber(slide && slide.slide, index + 1);
    const result = {
      slide: slideNumber,
      layout: toStringOrDefault(slide && slide.layout, "content"),
      title: toStringOrDefault(slide && slide.title, ""),
      subtitle: toStringOrDefault(slide && slide.subtitle, ""),
      blocks: Array.isArray(slide && slide.blocks) ? slide.blocks : [],
    };
    if (slide && slide.subtitle_icon) {
      result.subtitle_icon = String(slide.subtitle_icon);
    }
    return result;
  });

  normalized.sort((a, b) => a.slide - b.slide);

  const seen = new Set();
  for (const s of normalized) {
    if (seen.has(s.slide)) {
      throw new Error(`Duplicate slide number: ${s.slide}`);
    }
    seen.add(s.slide);
  }

  return normalized;
}

function normalizeMeta(rawMeta, slides) {
  const meta = rawMeta && typeof rawMeta === "object" ? rawMeta : {};
  const series = toStringOrDefault(meta.series, DEFAULT_SERIES);
  const totalSlides = toOptionalNumber(meta.total_slides, slides.length);

  return {
    title: toStringOrDefault(meta.title, slides[0] ? slides[0].title : "Untitled"),
    subtitle: toStringOrDefault(meta.subtitle, ""),
    series,
    tag: toStringOrDefault(meta.tag, series),
    author: toStringOrDefault(meta.author, DEFAULT_AUTHOR),
    author_handle: toStringOrDefault(meta.author_handle, DEFAULT_AUTHOR_HANDLE),
    total_slides: totalSlides,
    source_tip: toOptionalNumber(meta.source_tip, null),
    source_file: toStringOrDefault(meta.source_file, ""),
    created_at: toStringOrDefault(meta.created_at, todayIsoDate()),
    cover_illustration: toStringOrDefault(meta.cover_illustration, ""),
    theme: meta.theme ? String(meta.theme) : null,
  };
}

async function parseSpec(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  const parsed = yaml.load(source);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid YAML: expected an object with meta and slides");
  }

  const slides = normalizeSlides(parsed.slides);
  const meta = normalizeMeta(parsed.meta, slides);

  return { meta, slides };
}

module.exports = {
  parseSpec,
};
