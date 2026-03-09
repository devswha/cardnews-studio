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
  var newSpecBtn = document.getElementById("newSpecBtn");
  var deleteSpecBtn = document.getElementById("deleteSpecBtn");
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
  var creationFlowRoot = document.getElementById("creationFlowRoot");
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
  var pendingSlideAiAction = "";
  var creationResources = {
    aiStatus: { available: false, checked: false, reason: "" },
    templates: [],
    loadPromise: null,
  };
  var busy = {
    saving: false,
    rendering: false,
    generatingSlide: false,
    loadingSpec: false,
    preparingCreationFlow: false,
    creatingSpec: false,
    deletingSpec: false,
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

  function isCreationFlowOpen() {
    return Boolean(
      window.CreationFlow &&
      typeof window.CreationFlow.isOpen === "function" &&
      window.CreationFlow.isOpen()
    );
  }

  function parseJsonResponse(res) {
    if (!res) {
      return Promise.reject(new Error("No response received."));
    }

    return res.json().catch(function () {
      return {};
    }).then(function (data) {
      if (res.ok) {
        return data;
      }

      var message = data && data.error
        ? data.error
        : (res.status ? "Request failed: " + res.status : "Request failed.");
      var error = new Error(message);
      error.status = res.status;
      error.response = data;
      throw error;
    });
  }

  function normalizeAiStatus(data, fallbackError) {
    var safeData = data && typeof data === "object" ? data : {};
    var reason = safeData.reason || safeData.error || fallbackError || "";
    return {
      available: Boolean(safeData.available),
      checked: true,
      reason: reason,
    };
  }

  function normalizeTemplates(data) {
    var rawTemplates = Array.isArray(data)
      ? data
      : (data && Array.isArray(data.templates) ? data.templates : []);

    return rawTemplates
      .filter(function (template) {
        return template && typeof template === "object";
      })
      .map(function (template, index) {
        var copy = Object.assign({}, template);
        if (!copy.id) {
          copy.id = String(copy.slug || copy.name || copy.title || ("template-" + index));
        }
        return copy;
      });
  }

  function loadAiStatus(options) {
    var opts = options || {};
    if (creationResources.aiStatus.checked && !opts.force) {
      return Promise.resolve(creationResources.aiStatus);
    }

    return fetch("/api/ai-status")
      .then(parseJsonResponse)
      .then(function (data) {
        creationResources.aiStatus = normalizeAiStatus(data);
        return creationResources.aiStatus;
      })
      .catch(function (err) {
        creationResources.aiStatus = normalizeAiStatus(null, err && err.message ? err.message : "");
        return creationResources.aiStatus;
      });
  }

  function loadCreationTemplates(options) {
    var opts = options || {};
    if (creationResources.templates.length && !opts.force) {
      return Promise.resolve(creationResources.templates.slice());
    }

    return fetch("/api/templates")
      .then(parseJsonResponse)
      .then(function (data) {
        creationResources.templates = normalizeTemplates(data);
        return creationResources.templates.slice();
      })
      .catch(function () {
        creationResources.templates = [];
        return [];
      });
  }

  function loadCreationResources(options) {
    var opts = options || {};
    if (creationResources.loadPromise && !opts.force) {
      return creationResources.loadPromise;
    }

    creationResources.loadPromise = Promise.all([
      loadAiStatus(opts),
      loadCreationTemplates(opts),
    ]).then(function (results) {
      return {
        aiStatus: results[0],
        templates: results[1],
      };
    }).finally(function () {
      creationResources.loadPromise = null;
    });

    return creationResources.loadPromise;
  }

  function setPreparingCreationFlow(isPreparing) {
    busy.preparingCreationFlow = Boolean(isPreparing);
    refreshUiState();
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

  function rerenderSlideFormPreservingFocus() {
    var focusState = captureFocusState();
    FormUI.renderSlideForm(slideFormContainer, state, renderCallbacks);
    restoreFocusState(focusState);
  }

  function refreshUiState() {
    var isBusy =
      busy.saving ||
      busy.rendering ||
      busy.generatingSlide ||
      busy.loadingSpec ||
      busy.preparingCreationFlow ||
      busy.creatingSpec ||
      busy.deletingSpec;
    var flowOpen = isCreationFlowOpen();
    var canActOnSpec = Boolean(state.slug) && !isBusy && !flowOpen;

    if (newSpecBtn) {
      newSpecBtn.disabled = isBusy || flowOpen;
    }
    if (deleteSpecBtn) {
      deleteSpecBtn.disabled = !canActOnSpec;
    }
    saveBtn.disabled = !canActOnSpec || !state.isDirty();
    saveRenderBtn.disabled = !canActOnSpec;
    renderBtn.disabled = !canActOnSpec;
    themeSelect.disabled = busy.rendering || busy.generatingSlide || busy.loadingSpec || busy.preparingCreationFlow || busy.creatingSpec || busy.deletingSpec || flowOpen;
    specSearchEl.disabled = busy.generatingSlide || busy.loadingSpec || busy.preparingCreationFlow || busy.creatingSpec || busy.deletingSpec || flowOpen;
    specListEl.querySelectorAll(".spec-item").forEach(function (item) {
      item.disabled = busy.generatingSlide || busy.loadingSpec || busy.preparingCreationFlow || busy.creatingSpec || busy.deletingSpec || flowOpen;
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
    } else if (busy.preparingCreationFlow) {
      setEditorStatus("Preparing…", "info");
    } else if (busy.creatingSpec) {
      setEditorStatus("Creating…", "info");
    } else if (busy.deletingSpec) {
      setEditorStatus("Deleting…", "warning");
    } else if (busy.generatingSlide) {
      setEditorStatus("Generating slide…", "info");
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

  function createSpecCatalogStub(slug) {
    return Helpers.normalizeSpecItem({
      slug: slug,
      title: slug,
      theme: "",
      totalSlides: state.getSlides().length,
      hasOutput: false,
      outputSlides: [],
    });
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

  function clearActiveSpecUi(message) {
    activeSpec = null;
    lastSelectedSlideIndex = 0;
    editorFilename.textContent = "spec.yaml";
    editorPanel.classList.add("hidden");
    validationPanel.innerHTML = "";
    validationPanel.classList.add("hidden");
    metaSection.innerHTML = "";
    slideList.innerHTML = "";
    slideFormContainer.innerHTML = "";
    selectedTheme = "";
    syncThemeSelect();
    clearPreview(message || Helpers.previewPlaceholderForSpec(null));
    renderSpecList();
    refreshUiState();
  }

  function syncEditorSelectionFromState() {
    if (!state.slug) {
      return;
    }

    activeSpec = findSpec(state.slug) || activeSpec || createSpecCatalogStub(state.slug);
    editorFilename.textContent = state.slug + ".yaml";
    editorPanel.classList.remove("hidden");
    syncActiveSpecFromState();
    selectedTheme = Helpers.resolveThemeSelection(activeSpec, availableThemes);
    syncThemeSelect();
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
      empty.textContent = specCatalog.length === 0
        ? "No specs yet. Create one with + New."
        : "No specs match your search.";
      specListEl.appendChild(empty);
      return;
    }

    filteredSpecs.forEach(function (spec) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "spec-item" + (activeSpec && activeSpec.slug === spec.slug ? " active" : "");
      item.dataset.slug = spec.slug;
      item.disabled =
        busy.generatingSlide ||
        busy.loadingSpec ||
        busy.preparingCreationFlow ||
        busy.creatingSpec ||
        busy.deletingSpec ||
        isCreationFlowOpen();

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
    return fetch("/api/specs")
      .then(function (res) {
        if (!res.ok) {
          throw new Error("Failed to load specs: " + res.status);
        }
        return res.json();
      })
      .then(function (specs) {
        specCatalog = (Array.isArray(specs) ? specs : []).map(Helpers.normalizeSpecItem);
        if (state.slug) {
          activeSpec = findSpec(state.slug) || activeSpec;
        } else if (activeSpec) {
          activeSpec = findSpec(activeSpec.slug);
        }
        renderSpecList();
        return specCatalog;
      })
      .catch(function (err) {
        specListEl.innerHTML = '<div class="spec-empty">Failed to load specs.</div>';
        specSearchMetaEl.textContent = "Load failed";
        console.error("Failed to load specs:", err);
        throw err;
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
    if (
      busy.generatingSlide ||
      busy.loadingSpec ||
      busy.preparingCreationFlow ||
      busy.creatingSpec ||
      busy.deletingSpec ||
      isCreationFlowOpen()
    ) {
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

  function getExistingSlugs() {
    return specCatalog.map(function (spec) {
      return spec.slug;
    }).filter(Boolean);
  }

  function extractCreateSpec(request) {
    if (!request || typeof request !== "object") {
      return undefined;
    }

    if (request.spec && typeof request.spec === "object" && !Array.isArray(request.spec)) {
      return request.spec;
    }
    if (request.draft && request.draft.spec && typeof request.draft.spec === "object") {
      return request.draft.spec;
    }
    if (request.generated && request.generated.spec && typeof request.generated.spec === "object") {
      return request.generated.spec;
    }
    if (request.result && request.result.spec && typeof request.result.spec === "object") {
      return request.result.spec;
    }

    return undefined;
  }

  function normalizeCreateRequest(request) {
    if (typeof request === "string") {
      return { slug: request };
    }
    if (request && typeof request === "object") {
      return {
        slug: request.slug || (request.draft && request.draft.slug) || (request.result && request.result.slug),
        spec: extractCreateSpec(request),
      };
    }
    return { slug: "" };
  }

  function requestGeneratedDraft(request) {
    var payload = request && typeof request === "object"
      ? Object.assign({}, request)
      : { text: String(request || "") };

    payload.text = String(payload.text || payload.rawText || payload.content || "").trim();
    if (!payload.text) {
      return Promise.reject(new Error("Enter text to generate a draft."));
    }
    if (payload.theme === undefined) {
      payload.theme = selectedTheme || null;
    }

    return fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(parseJsonResponse)
      .then(function (data) {
        if (data && data.spec && typeof data.spec === "object") {
          return data;
        }
        return { spec: data };
      });
  }

  function requestSlideVariant(request) {
    var payload = request && typeof request === "object"
      ? Object.assign({}, request)
      : {};

    if (!payload.spec || typeof payload.spec !== "object" || Array.isArray(payload.spec)) {
      return Promise.reject(new Error("A valid spec is required."));
    }

    if (!Number.isInteger(payload.slideIndex)) {
      return Promise.reject(new Error("A valid slide index is required."));
    }

    if (!payload.action) {
      return Promise.reject(new Error("A slide action is required."));
    }

    return fetch("/api/generate-slide-variant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(parseJsonResponse)
      .then(function (data) {
        if (data && data.slide && typeof data.slide === "object") {
          return data;
        }
        return { slide: data };
      });
  }

  function requestFetchedArticle(request) {
    var payload = request && typeof request === "object"
      ? Object.assign({}, request)
      : { url: String(request || "") };

    payload.url = String(payload.url || "").trim();
    if (!payload.url) {
      return Promise.reject(new Error("Enter a URL to fetch."));
    }

    return fetch("/api/fetch-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(parseJsonResponse)
      .then(function (data) {
        if (data && typeof data === "object") {
          var article = data.article && typeof data.article === "object"
            ? data.article
            : data;
          return Object.assign({}, data, {
            title: data.title || article.title || "",
            content: data.content || data.text || article.content || article.text || "",
            source: data.source || article.source || payload.url,
            url: data.url || article.url || payload.url,
          });
        }
        return {};
      });
  }

  function buildCreationFlowOptions(resources) {
    var safeResources = resources || {};
    var aiStatus = safeResources.aiStatus || creationResources.aiStatus || { available: false, checked: false, reason: "" };
    var templates = Array.isArray(safeResources.templates)
      ? safeResources.templates.slice()
      : creationResources.templates.slice();
    var defaultDescription = aiStatus.available
      ? "Start blank, use a template, or generate a draft from text or a URL."
      : "Start blank or use a template. AI text and URL generation are unavailable right now.";

    return {
      root: creationFlowRoot || null,
      mountNode: creationFlowRoot || null,
      portalTarget: creationFlowRoot || null,
      container: creationFlowRoot || null,
      existingSlugs: getExistingSlugs,
      getExistingSlugs: getExistingSlugs,
      templates: templates,
      getTemplates: loadCreationTemplates,
      loadTemplates: loadCreationTemplates,
      fetchTemplates: loadCreationTemplates,
      aiStatus: aiStatus,
      aiAvailable: Boolean(aiStatus.available),
      isAiAvailable: Boolean(aiStatus.available),
      getAiStatus: loadAiStatus,
      loadAiStatus: loadAiStatus,
      checkAiAvailability: loadAiStatus,
      generateSpec: requestGeneratedDraft,
      onGenerate: requestGeneratedDraft,
      fetchArticle: requestFetchedArticle,
      onFetchArticle: requestFetchedArticle,
      onFetchUrl: requestFetchedArticle,
      onCreate: createSpecFromFlow,
      createSpec: createSpecFromFlow,
      onSaveDraft: createSpecFromFlow,
      onOpenDraft: createSpecFromFlow,
      refreshSpecList: loadSpecList,
      onRefreshSpecs: loadSpecList,
      activeSlug: state.slug || "",
      currentTheme: selectedTheme || "",
      getTheme: function () {
        return selectedTheme || "";
      },
      description: defaultDescription,
    };
  }

  function createSpecFromFlow(request) {
    var payload = normalizeCreateRequest(request);

    return withBusyFlag("creatingSpec", function () {
      return state.createSpec(payload.slug, payload.spec)
        .then(function (data) {
          return loadSpecList().then(function () {
            syncEditorSelectionFromState();
            applySpecPreview(activeSpec);
            renderSpecList();
            setPreviewStatus("Created “" + state.slug + "”.", "success");
            showToast("Created “" + state.slug + "”.", "success", "Created");
            return data;
          });
        })
        .catch(function (err) {
          setPreviewStatus("Create failed: " + err.message, "error");
          showToast("Create failed: " + err.message, "error", "Create failed");
          throw err;
        });
    });
  }

  function openCreationFlow() {
    if (
      busy.generatingSlide ||
      busy.loadingSpec ||
      busy.preparingCreationFlow ||
      busy.creatingSpec ||
      busy.deletingSpec ||
      busy.saving ||
      busy.rendering ||
      isCreationFlowOpen()
    ) {
      return;
    }

    if (state.isDirty() && !confirm("Unsaved changes will be lost. Continue?")) {
      return;
    }

    if (!window.CreationFlow || typeof window.CreationFlow.open !== "function") {
      showToast("Creation dialog unavailable. Try again in a moment.", "warning", "New spec");
      return;
    }

    setPreparingCreationFlow(true);
    loadCreationResources({ force: true })
      .then(function (resources) {
        var flowPromise;
        refreshUiState();
        setPreparingCreationFlow(false);
        flowPromise = window.CreationFlow.open(buildCreationFlowOptions(resources));
        refreshUiState();
        return Promise.resolve(flowPromise).finally(function () {
          refreshUiState();
        });
      })
      .catch(function (err) {
        setPreparingCreationFlow(false);
        showToast("Failed to open the creation flow: " + err.message, "error", "New spec");
        throw err;
      })
      .catch(function () {
        // handled above
      });
  }

  function deleteCurrentSpec() {
    var slug = state.slug;

    if (!slug) {
      return;
    }

    if (
      !confirm(
        state.isDirty()
          ? "Delete “" + slug + "”? Unsaved changes will be lost and rendered output will be removed."
          : "Delete “" + slug + "”? This removes the spec and its rendered output."
      )
    ) {
      return;
    }

    withBusyFlag("deletingSpec", function () {
      return state.deleteSpec(slug)
        .then(function () {
          clearActiveSpecUi("Deleted “" + slug + "”. Select another spec or create a new one.");
          return loadSpecList();
        })
        .then(function () {
          setPreviewStatus("Deleted “" + slug + "”.", "success");
          showToast("Deleted “" + slug + "”.", "success", "Deleted");
        })
        .catch(function (err) {
          setPreviewStatus("Delete failed: " + err.message, "error");
          showToast("Delete failed: " + err.message, "error", "Delete failed");
          throw createHandledError(err.message);
        });
    }).catch(function () {
      // handled above
    });
  }

  if (newSpecBtn) {
    newSpecBtn.addEventListener("click", openCreationFlow);
  }

  if (deleteSpecBtn) {
    deleteSpecBtn.addEventListener("click", deleteCurrentSpec);
  }

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
    onAiSlideAction: function (idx, slideNumber, action) {
      void idx;
      void slideNumber;
      generateSlideVariantForActiveSlide(action);
    },
    isSlideAiBusy: function () {
      return busy.generatingSlide || Boolean(pendingSlideAiAction);
    },
    isSlideAiActionRunning: function (action) {
      return pendingSlideAiAction === action;
    },
    isSlideAiActionDisabled: function (idx, slide, action) {
      void slide;
      return action === "suggest-layout" && (idx <= 0 || idx >= state.getSlides().length - 1);
    },
  };

  state.onChange(function () {
    var focusState = captureFocusState();

    if (!state.slug) {
      activeSpec = null;
    } else {
      syncEditorSelectionFromState();
    }

    FormUI.renderMetaEditor(metaSection, state);
    FormUI.renderSlideList(slideList, state, renderCallbacks);
    rerenderSlideFormPreservingFocus();

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
      if (state.slug && !busy.saving && !busy.rendering && !busy.generatingSlide && !busy.preparingCreationFlow && !isCreationFlowOpen()) {
        doSave().catch(function () {
          // handled above
        });
      }
    }
  });

  // ── Single Slide Render ─────────────────────────────────────────────────────

  function humanizeSlideAction(action) {
    return {
      rewrite: "Rewrite",
      shorten: "Shorten",
      "punch-up": "Punch Up",
      "suggest-layout": "Suggest Layout",
    }[action] || "Generate";
  }

  function generateSlideVariantForActiveSlide(action) {
    var slideIndex = state.selectedSlideIndex;
    var currentSlide = state.getSlide(slideIndex);

    if (!state.slug || !currentSlide || busy.generatingSlide) {
      return;
    }

    try {
      ensureSpecIsValid();
    } catch (err) {
      return;
    }

    pendingSlideAiAction = action;
    refreshUiState();
    rerenderSlideFormPreservingFocus();

    withBusyFlag("generatingSlide", function () {
      return requestSlideVariant({
        spec: state.toJSON(),
        slideIndex: slideIndex,
        action: action,
      })
        .then(function (data) {
          var nextSlide = data && data.slide ? data.slide : data;
          if (!nextSlide || typeof nextSlide !== "object") {
            throw new Error("Slide generation returned an invalid response.");
          }

          state.replaceSlide(slideIndex, nextSlide);
          setPreviewStatus(humanizeSlideAction(action) + " updated slide " + (slideIndex + 1) + ".", "success");
          showToast(
            humanizeSlideAction(action) + " applied to slide " + (slideIndex + 1) + ". Render to preview changes.",
            "success",
            "AI update"
          );
        })
        .catch(function (err) {
          setPreviewStatus("Slide AI failed: " + err.message, "error");
          showToast("Slide AI failed: " + err.message, "error", "AI update failed");
          throw createHandledError(err.message);
        })
        .finally(function () {
          pendingSlideAiAction = "";
          refreshUiState();
          rerenderSlideFormPreservingFocus();
        });
    }).catch(function () {
      pendingSlideAiAction = "";
      refreshUiState();
      rerenderSlideFormPreservingFocus();
    });
  }

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
    if (busy.preparingCreationFlow || isCreationFlowOpen()) return;
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
  loadCreationResources().catch(function () {
    // Blank creation should remain available even if optional resources fail to load.
  });
})();
