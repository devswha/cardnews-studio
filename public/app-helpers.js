(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AppHelpers = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function normalizeSpecItem(spec) {
    var safeSpec = spec && typeof spec === "object" ? spec : {};
    var slug = String(safeSpec.slug || safeSpec.name || "");
    return {
      slug: slug,
      title: String(safeSpec.title || slug || "Untitled"),
      theme: safeSpec.theme ? String(safeSpec.theme) : "",
      totalSlides: Number.isFinite(Number(safeSpec.totalSlides)) ? Number(safeSpec.totalSlides) : 0,
      hasOutput: Boolean(safeSpec.hasOutput),
      outputSlides: Array.isArray(safeSpec.outputSlides)
        ? safeSpec.outputSlides.slice().map(function (fileName) { return String(fileName); })
        : [],
    };
  }

  function filterSpecs(specs, query) {
    var normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) {
      return specs.slice();
    }

    return specs.filter(function (spec) {
      return [spec.slug, spec.title, spec.theme]
        .filter(Boolean)
        .some(function (value) {
          return String(value).toLowerCase().includes(normalizedQuery);
        });
    });
  }

  function buildPreviewSlides(spec, cacheBust) {
    if (!spec || !spec.slug || !Array.isArray(spec.outputSlides) || spec.outputSlides.length === 0) {
      return [];
    }

    var suffix = cacheBust ? "?t=" + cacheBust : "";
    return spec.outputSlides.map(function (fileName) {
      return "/output/" + spec.slug + "/" + fileName + suffix;
    });
  }

  function previewPlaceholderForSpec(spec) {
    if (!spec) {
      return "Select a spec to start editing";
    }

    if (!spec.totalSlides) {
      return "This spec has no slides yet. Add a slide to get started.";
    }

    if (!spec.hasOutput || !spec.outputSlides || spec.outputSlides.length === 0) {
      return "No rendered preview yet. Click Render All or render a slide.";
    }

    return "";
  }

  function resolveThemeSelection(spec, availableThemes) {
    var theme = spec && spec.theme ? String(spec.theme) : "";
    if (!theme) {
      return "";
    }

    if (Array.isArray(availableThemes) && availableThemes.length > 0 && !availableThemes.includes(theme)) {
      return "";
    }

    return theme;
  }

  return {
    normalizeSpecItem: normalizeSpecItem,
    filterSpecs: filterSpecs,
    buildPreviewSlides: buildPreviewSlides,
    previewPlaceholderForSpec: previewPlaceholderForSpec,
    resolveThemeSelection: resolveThemeSelection,
  };
});
