// app.js — Main application logic for the card-news visual editor
// Depends on: app-helpers.js, block-schemas.js, schema-defaults.js, spec-validation.js, form-state.js, form-ui.js

(function () {
  "use strict";

  var Helpers = window.AppHelpers;
  var Validator = window.SpecValidation;

  // ── DOM references ──────────────────────────────────────────────────────────

  var specListEl = document.getElementById("specList");
  var specSearchEl = document.getElementById("specSearch");
  var specSearchMetaEl = document.getElementById("specSearchMeta");
  var editorPanel = document.getElementById("editorPanel");
  var editorFilename = document.getElementById("editorFilename");
  var editorStatus = document.getElementById("editorStatus");
  var validationPanel = document.getElementById("validationPanel");
  var saveBtn = document.getElementById("saveBtn");
  var saveRenderBtn = document.getElementById("saveRenderBtn");
  var renderBtn = document.getElementById("renderBtn");
  var themeSelect = document.getElementById("themeSelect");
  var metaSection = document.getElementById("metaSection");
  var slideList = document.getElementById("slideList");
  var slideFormContainer = document.getElementById("slideFormContainer");
  var placeholder = document.getElementById("placeholder");
  var previewStatus = document.getElementById("previewStatus");
  var previewImage = document.getElementById("previewImage");
  var slideImg = document.getElementById("slideImg");
  var previewNav = document.getElementById("previewNav");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var slideCounter = document.getElementById("slideCounter");
  var loadingOverlay = document.getElementById("loadingOverlay");
  var loadingText = document.getElementById("loadingText");
  var progressFill = document.getElementById("progressFill");
  var toastRegion = document.getElementById("toastRegion");

  // ── State ───────────────────────────────────────────────────────────────────

  var state = FormState.create();
  var specCatalog = [];
  var activeSpec = null;
  var availableThemes = [];
  var previewSlides = [];
  var previewIndex = 0;
  var lastSelectedSlideIndex = 0;
  var selectedTheme = "";
  var busy = {
    saving: false,
    rendering: false,
    loadingSpec: false,
  };

  // ── Shared UI helpers ───────────────────────────────────────────────────────

  function setEditorStatus(message, tone) {
    editorStatus.textContent = message;
    editorStatus.className = "editor-status" + (tone ? " editor-status--" + tone : "");
  }

  function setPreviewStatus(message, tone) {
    if (!message) {
      previewStatus.textContent = "";
      previewStatus.className = "preview-status hidden";
      return;
    }

    previewStatus.textContent = message;
    previewStatus.className = "preview-status preview-status--" + (tone || "info");
  }

  function createHandledError(message) {
    var error = new Error(message);
    error.isHandled = true;
    return error;
  }

  function showToast(message, tone, title) {
    if (!toastRegion || !message) {
      return;
    }

    var toast = document.createElement("div");
    toast.className = "toast toast--" + (tone || "info");

    var toastTitle = document.createElement("div");
    toastTitle.className = "toast__title";
    toastTitle.textContent = title || {
      success: "Done",
      warning: "Heads up",
      error: "Action blocked",
      info: "Info",
    }[tone || "info"];
    toast.appendChild(toastTitle);

    var toastBody = document.createElement("div");
    toastBody.className = "toast__body";
    toastBody.textContent = message;
    toast.appendChild(toastBody);

    toastRegion.appendChild(toast);

    setTimeout(function () {
      toast.remove();
    }, tone === "error" ? 4200 : 2600);
  }

  function getValidationResult() {
    return Validator.validateSpec(state.toJSON(), BLOCK_SCHEMAS);
  }

  function renderValidationPanel(validation) {
    if (!validationPanel || !state.slug) {
      return;
    }

    if (!validation || validation.valid) {
      validationPanel.innerHTML = "";
      validationPanel.classList.add("hidden");
      return;
    }

    validationPanel.innerHTML = "";
    validationPanel.classList.remove("hidden");

    var title = document.createElement("div");
    title.className = "validation-panel__title";
    title.textContent = "Validation required before saving";
    validationPanel.appendChild(title);

    var summary = document.createElement("div");
    summary.className = "validation-panel__summary";
    summary.textContent = Validator.summarize(validation);
    validationPanel.appendChild(summary);

    var list = document.createElement("ol");
    list.className = "validation-panel__list";
    validation.errors.slice(0, 6).forEach(function (issue) {
      var item = document.createElement("li");
      item.textContent = issue.message;
      list.appendChild(item);
    });
    validationPanel.appendChild(list);
  }

  function ensureSpecIsValid() {
    var validation = getValidationResult();
    renderValidationPanel(validation);

    if (validation.valid) {
      return validation;
    }

    var summary = Validator.summarize(validation);
    setPreviewStatus(summary, "error");
    showToast(summary, "error", "Validation");
    throw createHandledError(summary);
  }

  function captureFocusState() {
    var active = document.activeElement;
    if (!active || !active.dataset || !active.dataset.focusKey) {
      return null;
    }

    return {
      focusKey: active.dataset.focusKey,
      selectionStart: typeof active.selectionStart === "number" ? active.selectionStart : null,
      selectionEnd: typeof active.selectionEnd === "number" ? active.selectionEnd : null,
    };
  }

  function restoreFocusState(snapshot) {
    if (!snapshot || !snapshot.focusKey) {
      return;
    }

    var selector = '[data-focus-key=\"' + snapshot.focusKey + '\"]';
    var target = document.querySelector(selector);

    if (!target || typeof target.focus !== "function") {
      return;
    }

    target.focus({ preventScroll: true });
    if (
      typeof snapshot.selectionStart === "number" &&
      typeof snapshot.selectionEnd === "number" &&
      typeof target.setSelectionRange === "function"
    ) {
      target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    }
  }

  function refreshUiState() {
    var isBusy = busy.saving || busy.rendering || busy.loadingSpec;
    var canActOnSpec = Boolean(state.slug) && !isBusy;

    saveBtn.disabled = !canActOnSpec || !state.isDirty();
    saveRenderBtn.disabled = !canActOnSpec;
    renderBtn.disabled = !canActOnSpec;
    themeSelect.disabled = busy.rendering || busy.loadingSpec;
    specSearchEl.disabled = busy.loadingSpec;
    specListEl.querySelectorAll(".spec-item").forEach(function (item) {
      item.disabled = busy.loadingSpec;
    });

    if (state.isDirty()) {
      saveBtn.classList.add("dirty");
      saveRenderBtn.classList.add("dirty");
    } else {
      saveBtn.classList.remove("dirty");
      saveRenderBtn.classList.remove("dirty");
    }

    if (busy.loadingSpec) {
      setEditorStatus("Loading…", "info");
    } else if (busy.rendering) {
      setEditorStatus("Rendering…", "info");
    } else if (busy.saving) {
      setEditorStatus("Saving…", "info");
    } else if (state.isDirty()) {
      setEditorStatus("Modified", "warning");
    } else if (state.slug) {
      setEditorStatus("Saved", "muted");
    } else {
      setEditorStatus("Ready", "muted");
    }
  }

  function withBusyFlag(flag, task) {
    if (busy[flag]) {
      return Promise.reject(new Error("Another " + flag + " task is already in progress."));
    }

    busy[flag] = true;
    refreshUiState();

    return Promise.resolve()
      .then(task)
      .finally(function () {
        busy[flag] = false;
        refreshUiState();
      });
  }

  function findSpec(slug) {
    return specCatalog.find(function (spec) {
      return spec.slug === slug;
    }) || null;
  }

  function syncThemeSelect() {
    themeSelect.value = selectedTheme || "";
  }

  function syncActiveSpecFromState() {
    if (!activeSpec) {
      return;
    }

    var meta = state.getMeta();
    activeSpec.title = String(meta.title || activeSpec.slug || "Untitled");
    activeSpec.theme = meta.theme ? String(meta.theme) : "";
    activeSpec.totalSlides = state.getSlides().length;
  }

  // ── Spec List ───────────────────────────────────────────────────────────────

  function renderSpecList() {
    var filteredSpecs = Helpers.filterSpecs(specCatalog, specSearchEl.value);
    specListEl.innerHTML = "";

    specSearchMetaEl.textContent = filteredSpecs.length === specCatalog.length
      ? specCatalog.length + " specs"
      : filteredSpecs.length + " / " + specCatalog.length + " specs";

    if (filteredSpecs.length === 0) {
      var empty = document.createElement("div");
      empty.className = "spec-empty";
      empty.textContent = "No specs match your search.";
      specListEl.appendChild(empty);
      return;
    }

    filteredSpecs.forEach(function (spec) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "spec-item" + (activeSpec && activeSpec.slug === spec.slug ? " active" : "");
      item.dataset.slug = spec.slug;
      item.disabled = busy.loadingSpec;

      var title = document.createElement("div");
      title.className = "spec-title";
      title.textContent = spec.title || spec.slug;
      item.appendChild(title);

      if (spec.title !== spec.slug) {
        var slug = document.createElement("div");
        slug.className = "spec-slug";
        slug.textContent = spec.slug;
        item.appendChild(slug);
      }

      var meta = document.createElement("div");
      meta.className = "spec-meta";
      meta.textContent = (spec.totalSlides || 0) + " slides · " + (spec.theme || "dark");
      if (spec.hasOutput) {
        var dot = document.createElement("span");
        dot.className = "output-dot";
        dot.title = "Rendered output available";
        meta.appendChild(dot);
      }
      item.appendChild(meta);

      item.addEventListener("click", function () {
        selectSpec(spec.slug);
      });

      specListEl.appendChild(item);
    });
  }

  function loadSpecList() {
    fetch("/api/specs")
      .then(function (res) {
        if (!res.ok) {
          throw new Error("Failed to load specs: " + res.status);
        }
        return res.json();
      })
      .then(function (specs) {
        specCatalog = (Array.isArray(specs) ? specs : []).map(Helpers.normalizeSpecItem);
        if (activeSpec) {
          activeSpec = findSpec(activeSpec.slug);
        }
        renderSpecList();
      })
      .catch(function (err) {
        specListEl.innerHTML = '<div class="spec-empty">Failed to load specs.</div>';
        specSearchMetaEl.textContent = "Load failed";
        console.error("Failed to load specs:", err);
      });
  }

  function applySpecPreview(spec) {
    if (!spec) {
      clearPreview(Helpers.previewPlaceholderForSpec(null));
      return;
    }

    var existingSlides = Helpers.buildPreviewSlides(spec, Date.now());
    if (existingSlides.length > 0) {
      previewSlides = existingSlides;
      previewIndex = 0;
      displayPreview();
      setPreviewStatus("Loaded existing render preview.", "success");
      return;
    }

    clearPreview(Helpers.previewPlaceholderForSpec(spec));
  }

  function selectSpec(slug) {
    if (busy.loadingSpec) {
      return;
    }

    if (state.isDirty() && !confirm("Unsaved changes will be lost. Continue?")) {
      return;
    }

    activeSpec = findSpec(slug);
    renderSpecList();

    editorFilename.textContent = slug + ".yaml";
    editorPanel.classList.remove("hidden");
    selectedTheme = Helpers.resolveThemeSelection(activeSpec, availableThemes);
    syncThemeSelect();
    applySpecPreview(activeSpec);

    withBusyFlag("loadingSpec", function () {
      return state.loadSpec(slug)
        .then(function () {
          syncActiveSpecFromState();
          renderSpecList();
          setPreviewStatus("Editing “" + slug + "”.", "info");
        })
        .catch(function (err) {
          setPreviewStatus("Failed to load spec.", "error");
          showToast("Failed to load spec: " + err.message, "error", "Load failed");
          throw createHandledError(err.message);
        });
    }).catch(function () {
      // handled above
    });
  }

  specSearchEl.addEventListener("input", renderSpecList);

  // ── Theme List ──────────────────────────────────────────────────────────────

  function loadThemes() {
    fetch("/api/themes")
      .then(function (res) {
        if (!res.ok) {
          throw new Error("Failed to load themes: " + res.status);
        }
        return res.json();
      })
      .then(function (themes) {
        availableThemes = Array.isArray(themes) ? themes : [];
        themeSelect.innerHTML = '<option value="">dark (default)</option>';
        availableThemes.forEach(function (t) {
          var option = document.createElement("option");
          option.value = t;
          option.textContent = t;
          themeSelect.appendChild(option);
        });
        selectedTheme = Helpers.resolveThemeSelection(activeSpec, availableThemes);
        syncThemeSelect();
      })
      .catch(function () {
        availableThemes = [];
      });
  }

  themeSelect.addEventListener("change", function () {
    selectedTheme = themeSelect.value;
    if (state.slug) {
      setPreviewStatus(
        selectedTheme ? "Theme override set to “" + selectedTheme + "”." : "Using the default dark theme.",
        "info"
      );
      showToast(
        selectedTheme ? "Theme override set to “" + selectedTheme + "”." : "Using the default dark theme.",
        "info",
        "Theme"
      );
    }
  });

  // ── State → UI Binding ──────────────────────────────────────────────────────

  var renderCallbacks = {
    onRenderSlide: function (idx, slideNumber) {
      renderSingleSlide(slideNumber);
    },
    onSelectSlide: function (idx) {
      syncPreviewToSelectedSlide(idx);
    },
  };

  state.onChange(function () {
    var focusState = captureFocusState();

    FormUI.renderMetaEditor(metaSection, state);
    FormUI.renderSlideList(slideList, state, renderCallbacks);
    FormUI.renderSlideForm(slideFormContainer, state, renderCallbacks);

    syncActiveSpecFromState();
    if (activeSpec) renderSpecList();

    if (state.selectedSlideIndex !== lastSelectedSlideIndex) {
      lastSelectedSlideIndex = state.selectedSlideIndex;
      syncPreviewToSelectedSlide(state.selectedSlideIndex);
    }

    restoreFocusState(focusState);
    renderValidationPanel(getValidationResult());
    refreshUiState();
  });

  // ── Save ────────────────────────────────────────────────────────────────────

  function doSave() {
    if (!state.slug) {
      return Promise.reject(new Error("No spec selected"));
    }

    try {
      ensureSpecIsValid();
    } catch (err) {
      return Promise.reject(err);
    }

    return withBusyFlag("saving", function () {
      return state.saveSpec()
        .then(function () {
          syncActiveSpecFromState();
          renderSpecList();
          setPreviewStatus("Saved “" + state.slug + "”.", "success");
          showToast("Saved “" + state.slug + "”.", "success", "Saved");
        })
        .catch(function (err) {
          setPreviewStatus("Save failed: " + err.message, "error");
          showToast("Save failed: " + err.message, "error", "Save failed");
          throw createHandledError(err.message);
        });
    });
  }

  saveBtn.addEventListener("click", function () {
    doSave().catch(function () {
      // handled above
    });
  });

  saveRenderBtn.addEventListener("click", function () {
    doSave()
      .then(function () {
        renderAll();
      })
      .catch(function () {
        // handled above
      });
  });

  // Ctrl+S / Cmd+S
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      if (state.slug && !busy.saving && !busy.rendering) {
        doSave().catch(function () {
          // handled above
        });
      }
    }
  });

  // ── Single Slide Render ─────────────────────────────────────────────────────

  function renderSingleSlide(slideNumber) {
    if (!state.slug || busy.rendering) return;

    showLoading("Saving...");

    withBusyFlag("rendering", function () {
      return doSave()
        .then(function () {
          showLoading("Rendering slide " + slideNumber + "...");
          return fetch("/api/render-slide", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              spec: state.slug,
              slideNumber: slideNumber,
              theme: selectedTheme || null,
            }),
          });
        })
        .then(function (res) {
          if (!res.ok) {
            return res.json().catch(function () { return {}; }).then(function (data) {
              throw new Error(data.error || ("Render failed: " + res.status));
            });
          }
          return res.json();
        })
        .then(function (data) {
          var fileName = String(slideNumber).padStart(2, "0") + ".png";
          if (activeSpec) {
            activeSpec.hasOutput = true;
            if (!Array.isArray(activeSpec.outputSlides)) activeSpec.outputSlides = [];
            if (!activeSpec.outputSlides.includes(fileName)) {
              activeSpec.outputSlides.push(fileName);
              activeSpec.outputSlides.sort();
            }
          }
          renderSpecList();
          showSlidePreview(data.png, slideNumber);
          setPreviewStatus("Rendered slide " + slideNumber + ".", "success");
          showToast("Rendered slide " + slideNumber + ".", "success", "Render complete");
        })
        .catch(function (err) {
          if (err && err.isHandled) {
            throw err;
          }
          setPreviewStatus("Render failed: " + err.message, "error");
          showToast("Render failed: " + err.message, "error", "Render failed");
          throw createHandledError(err.message);
        })
        .finally(hideLoading);
    }).catch(function () {
      hideLoading();
    });
  }

  function showSlidePreview(pngUrl, slideNumber) {
    var idx = Math.max(0, slideNumber - 1);
    while (previewSlides.length <= idx) previewSlides.push(null);
    previewSlides[idx] = pngUrl + (pngUrl.includes("?") ? "&" : "?") + "t=" + Date.now();

    previewIndex = idx;
    displayPreview();
  }

  function clearPreview(message) {
    previewSlides = [];
    previewIndex = 0;
    placeholder.textContent = message || "Select a spec and click Render";
    displayPreview();
  }

  function syncPreviewToSelectedSlide(index) {
    if (!previewSlides.length) {
      return;
    }

    previewIndex = Math.max(0, Math.min(index, previewSlides.length - 1));
    displayPreview();
  }

  // ── Full Render (SSE) ──────────────────────────────────────────────────────

  function renderAll() {
    if (!state.slug || busy.rendering) return;

    showLoading("Rendering...");
    progressFill.style.width = "0%";
    previewSlides = [];

    withBusyFlag("rendering", function () {
      return fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spec: state.slug,
          theme: selectedTheme || null,
        }),
      }).then(function (res) {
        if (!res.ok || !res.body) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            throw new Error(data.error || ("Render failed: " + res.status));
          });
        }

        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";

        function pump() {
          return reader.read().then(function (result) {
            if (result.done) return;
            buffer += decoder.decode(result.value, { stream: true });

            var lines = buffer.split("\n");
            buffer = lines.pop();

            var eventType = "";
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i];
              if (line.indexOf("event: ") === 0) {
                eventType = line.substring(7);
              } else if (line.indexOf("data: ") === 0) {
                var data = JSON.parse(line.substring(6));
                handleSSE(eventType, data);
                eventType = "";
              }
            }
            return pump();
          });
        }

        return pump();
      }).catch(function (err) {
        if (err && err.isHandled) {
          throw err;
        }
        setPreviewStatus("Render failed: " + err.message, "error");
        showToast("Render failed: " + err.message, "error", "Render failed");
        throw createHandledError(err.message);
      }).finally(hideLoading);
    }).catch(function () {
      hideLoading();
    });
  }

  function handleSSE(event, data) {
    if (event === "progress") {
      var pct = Math.round((data.slide / data.total) * 100);
      progressFill.style.width = pct + "%";
      loadingText.textContent = "Rendering slide " + data.slide + " / " + data.total;
    } else if (event === "complete") {
      previewSlides = data.slides.map(function (fileName) {
        return "/output/" + data.slug + "/" + fileName + "?t=" + Date.now();
      });
      previewIndex = 0;

      if (activeSpec) {
        activeSpec.hasOutput = previewSlides.length > 0;
        activeSpec.outputSlides = Array.isArray(data.slides) ? data.slides.slice() : [];
        activeSpec.totalSlides = data.total || activeSpec.totalSlides;
      }

      renderSpecList();
      displayPreview();
      setPreviewStatus("Rendered " + (data.slides ? data.slides.length : 0) + " slides.", "success");
      showToast("Rendered " + (data.slides ? data.slides.length : 0) + " slides.", "success", "Render complete");
    } else if (event === "error") {
      setPreviewStatus("Render failed: " + data.message, "error");
      showToast("Render failed: " + data.message, "error", "Render failed");
      throw createHandledError(data.message);
    }
  }

  renderBtn.addEventListener("click", function () {
    if (state.isDirty()) {
      doSave()
        .then(function () { renderAll(); })
        .catch(function () {
          // handled above
        });
    } else {
      renderAll();
    }
  });

  // ── Preview Navigation ────────────────────────────────────────────────────

  function displayPreview() {
    var hasSlides = previewSlides.length > 0 && Boolean(previewSlides[previewIndex] || previewSlides.some(Boolean));

    if (!hasSlides) {
      placeholder.classList.remove("hidden");
      previewImage.classList.add("hidden");
      previewNav.classList.add("hidden");
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    placeholder.classList.add("hidden");
    previewImage.classList.remove("hidden");
    previewNav.classList.remove("hidden");

    if (!previewSlides[previewIndex]) {
      for (var i = 0; i < previewSlides.length; i++) {
        if (previewSlides[i]) {
          previewIndex = i;
          break;
        }
      }
    }

    if (previewSlides[previewIndex]) {
      slideImg.src = previewSlides[previewIndex];
    }
    slideCounter.textContent = (previewIndex + 1) + " / " + previewSlides.length;
    prevBtn.disabled = previewIndex <= 0;
    nextBtn.disabled = previewIndex >= previewSlides.length - 1;
  }

  prevBtn.addEventListener("click", function () {
    if (previewIndex > 0) {
      previewIndex--;
      displayPreview();
    }
  });

  nextBtn.addEventListener("click", function () {
    if (previewIndex < previewSlides.length - 1) {
      previewIndex++;
      displayPreview();
    }
  });

  // Arrow keys for preview navigation
  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    if (e.key === "ArrowLeft") {
      prevBtn.click();
    } else if (e.key === "ArrowRight") {
      nextBtn.click();
    }
  });

  // ── Loading Overlay ───────────────────────────────────────────────────────

  function showLoading(msg) {
    loadingText.textContent = msg || "Rendering...";
    if (!busy.rendering) {
      progressFill.style.width = "0%";
    }
    loadingOverlay.classList.remove("hidden");
  }

  function hideLoading() {
    loadingOverlay.classList.add("hidden");
  }

  // ── Unsaved Changes Warning ───────────────────────────────────────────────

  window.addEventListener("beforeunload", function (e) {
    if (state.isDirty()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────

  clearPreview(Helpers.previewPlaceholderForSpec(null));
  refreshUiState();
  loadSpecList();
  loadThemes();
})();
