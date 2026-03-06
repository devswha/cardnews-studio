(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SpecValidation = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function pushIssue(target, path, message) {
    target.push({ path: path, message: message });
  }

  function validateSpec(spec, blockSchemas) {
    var errors = [];
    var warnings = [];
    var data = spec && typeof spec === "object" ? spec : {};
    var meta = data.meta && typeof data.meta === "object" ? data.meta : {};
    var slides = Array.isArray(data.slides) ? data.slides : [];
    var seenSlideNumbers = Object.create(null);

    if (!slides.length) {
      pushIssue(errors, "slides", "At least one slide is required.");
    }

    if (!normalizeText(meta.title)) {
      pushIssue(warnings, "meta.title", "Meta title is empty. The renderer will fall back to the first slide title.");
    }

    if (meta.total_slides != null && meta.total_slides !== "") {
      var declaredTotal = Number(meta.total_slides);
      if (Number.isFinite(declaredTotal) && slides.length && declaredTotal !== slides.length) {
        pushIssue(warnings, "meta.total_slides", "meta.total_slides does not match the number of slides.");
      }
    }

    slides.forEach(function (slide, index) {
      var currentSlide = slide && typeof slide === "object" ? slide : {};
      var slideNumber = Number(currentSlide.slide);
      var label = "Slide " + (Number.isInteger(slideNumber) && slideNumber > 0 ? slideNumber : index + 1);

      if (!Number.isInteger(slideNumber) || slideNumber < 1) {
        pushIssue(errors, "slides." + index + ".slide", label + " number must be a positive integer.");
      } else if (seenSlideNumbers[slideNumber]) {
        pushIssue(errors, "slides." + index + ".slide", "Slide number " + slideNumber + " is duplicated.");
      } else {
        seenSlideNumbers[slideNumber] = true;
      }

      if (!normalizeText(currentSlide.layout)) {
        pushIssue(errors, "slides." + index + ".layout", label + " layout is required.");
      }

      if (!normalizeText(currentSlide.title)) {
        pushIssue(errors, "slides." + index + ".title", label + " title is required.");
      }

      if (!Array.isArray(currentSlide.blocks)) {
        pushIssue(errors, "slides." + index + ".blocks", label + " blocks must be an array.");
        return;
      }

      currentSlide.blocks.forEach(function (block, blockIndex) {
        var currentBlock = block && typeof block === "object" ? block : {};
        var type = normalizeText(currentBlock.type);
        var blockPath = "slides." + index + ".blocks." + blockIndex;

        if (!type) {
          pushIssue(errors, blockPath + ".type", label + " block #" + (blockIndex + 1) + " is missing a type.");
          return;
        }

        if (blockSchemas && !blockSchemas[type]) {
          pushIssue(errors, blockPath + ".type", label + " block #" + (blockIndex + 1) + " has an unknown type: " + type + ".");
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
    };
  }

  function summarizeValidation(result) {
    var errors = result && Array.isArray(result.errors) ? result.errors : [];
    if (!errors.length) {
      return "Validation passed.";
    }
    return "Fix " + errors.length + " validation issue" + (errors.length === 1 ? "" : "s") + " before saving.";
  }

  return {
    validateSpec: validateSpec,
    summarize: summarizeValidation,
    summarizeValidation: summarizeValidation,
  };
});
