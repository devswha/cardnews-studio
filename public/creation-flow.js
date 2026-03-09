(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CreationFlow = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var MAX_TEXT_LENGTH = 50000;
  var BASE_TABS = [
    { key: "blank", label: "Blank" },
    { key: "text", label: "From Text" },
    { key: "url", label: "From URL" },
  ];
  var GENERATION_OPTION_GROUPS = [
    {
      key: "tone",
      label: "Tone",
      options: [
        { value: "professional", label: "Professional" },
        { value: "playful", label: "Playful" },
        { value: "bold", label: "Bold" },
        { value: "technical", label: "Technical" },
      ],
    },
    {
      key: "density",
      label: "Density",
      options: [
        { value: "compact", label: "Compact" },
        { value: "balanced", label: "Balanced" },
        { value: "detailed", label: "Detailed" },
      ],
    },
    {
      key: "intent",
      label: "Intent",
      options: [
        { value: "awareness", label: "Awareness" },
        { value: "explain", label: "Explain" },
        { value: "compare", label: "Compare" },
        { value: "action", label: "Action" },
      ],
    },
    {
      key: "slideCount",
      label: "Slides",
      options: [
        { value: 3, label: "3" },
        { value: 5, label: "5" },
        { value: 7, label: "7" },
      ],
    },
  ];
  var DEFAULT_GENERATION_OPTIONS = {
    tone: "professional",
    density: "balanced",
    intent: "explain",
    slideCount: 5,
  };

  var modalRoot = null;
  var refs = null;
  var resolveOpen = null;
  var lastFocusedElement = null;
  var openToken = 0;
  var DEFAULT_TEMPLATES = buildDefaultTemplates();
  var state = createDefaultState();

  function createTemplateSpec(title, subtitle, slides) {
    var safeSlides = Array.isArray(slides) ? slides : [];
    return {
      meta: {
        title: title,
        subtitle: subtitle,
        total_slides: safeSlides.length,
      },
      slides: safeSlides.map(function (slide, index) {
        var current = slide && typeof slide === "object" ? slide : {};
        return {
          slide: index + 1,
          layout: current.layout || "content",
          title: current.title || (index === 0 ? title : "Slide " + (index + 1)),
          subtitle: current.subtitle || "",
          blocks: Array.isArray(current.blocks) ? current.blocks.slice() : [],
        };
      }),
    };
  }

  function buildDefaultTemplates() {
    return [
      {
        id: "basic-5",
        title: "Basic 5-Slide",
        description: "Cover, context, key point, action step, closing summary.",
        spec: createTemplateSpec("Basic Card News", "Add your hook and supporting points.", [
          { layout: "cover", title: "Basic Card News", subtitle: "Clear headline + short hook" },
          { layout: "content", title: "What happened?", subtitle: "Set the context in one slide" },
          { layout: "split", title: "Why it matters", subtitle: "Highlight the strongest takeaway" },
          { layout: "content", title: "What to do next", subtitle: "Share the action or lesson" },
          { layout: "closing", title: "Key takeaway", subtitle: "Wrap with the main message" },
        ]),
      },
      {
        id: "tutorial-7",
        title: "Tutorial 7-Slide",
        description: "Teach a workflow from the hook through a final recap.",
        spec: createTemplateSpec("Tutorial Card News", "Walk readers through the process.", [
          { layout: "cover", title: "Tutorial Card News", subtitle: "What readers will learn" },
          { layout: "content", title: "Step 1", subtitle: "Introduce the first move" },
          { layout: "split", title: "Step 2", subtitle: "Show key options or parts" },
          { layout: "hero", title: "Step 3", subtitle: "Feature the biggest action" },
          { layout: "content", title: "Step 4", subtitle: "Add supporting detail" },
          { layout: "minimal", title: "Quick checklist", subtitle: "Summarize the must-dos" },
          { layout: "closing", title: "Wrap-up", subtitle: "Recap the tutorial cleanly" },
        ]),
      },
      {
        id: "comparison-5",
        title: "Comparison",
        description: "Compare two ideas, products, or approaches with a clear finish.",
        spec: createTemplateSpec("Comparison Card News", "Frame the decision clearly.", [
          { layout: "cover", title: "Comparison Card News", subtitle: "What are we comparing?" },
          { layout: "split", title: "Option A", subtitle: "Strengths, trade-offs, best fit" },
          { layout: "split", title: "Option B", subtitle: "Strengths, trade-offs, best fit" },
          { layout: "content", title: "Decision guide", subtitle: "When each option wins" },
          { layout: "closing", title: "Bottom line", subtitle: "End with the recommendation" },
        ]),
      },
      {
        id: "quick-tip-3",
        title: "Quick Tip 3-Slide",
        description: "Fast hook, one practical tip, one strong close.",
        spec: createTemplateSpec("Quick Tip", "Deliver a concise, punchy lesson.", [
          { layout: "cover", title: "Quick Tip", subtitle: "Lead with the benefit" },
          { layout: "hero", title: "The tip", subtitle: "Show the one thing readers should do" },
          { layout: "closing", title: "Remember this", subtitle: "Land the takeaway cleanly" },
        ]),
      },
    ];
  }

  function createDefaultState(options) {
    var safeOptions = options && typeof options === "object" ? options : {};
    return {
      open: false,
      activeTab: "blank",
      slug: String(safeOptions.initialSlug || safeOptions.activeSlug || "").trim(),
      error: "",
      busy: false,
      pendingLabel: "",
      options: safeOptions,
      aiAvailable: resolveAiAvailability(safeOptions),
      templates: normalizeTemplates(safeOptions.templates),
      existingSlugs: normalizeExistingSlugs(readExistingSlugSource(safeOptions.getExistingSlugs || safeOptions.existingSlugs)),
      selectedTemplateId: "",
      textInput: "",
      urlInput: "",
      fetchedText: "",
      fetchedTitle: "",
      fetchedSource: "",
      generationOptions: createDefaultGenerationOptions(safeOptions.generationOptions),
      draft: null,
    };
  }

  function normalizeGenerationOptionValue(groupKey, rawValue) {
    var group = GENERATION_OPTION_GROUPS.find(function (entry) {
      return entry.key === groupKey;
    });
    var defaultValue = DEFAULT_GENERATION_OPTIONS[groupKey];

    if (!group) {
      return defaultValue;
    }

    var match = group.options.find(function (option) {
      return String(option.value) === String(rawValue);
    });
    return match ? match.value : defaultValue;
  }

  function createDefaultGenerationOptions(source) {
    var safeSource = source && typeof source === "object" ? source : {};
    return {
      tone: normalizeGenerationOptionValue("tone", safeSource.tone),
      density: normalizeGenerationOptionValue("density", safeSource.density),
      intent: normalizeGenerationOptionValue("intent", safeSource.intent),
      slideCount: normalizeGenerationOptionValue("slideCount", safeSource.slideCount),
    };
  }

  function cloneGenerationOptions(source) {
    return createDefaultGenerationOptions(source);
  }

  function getGenerationOptionLabel(groupKey, rawValue) {
    var group = GENERATION_OPTION_GROUPS.find(function (entry) {
      return entry.key === groupKey;
    });
    if (!group) {
      return String(rawValue || "");
    }

    var match = group.options.find(function (option) {
      return String(option.value) === String(rawValue);
    });
    return match ? match.label : String(rawValue || "");
  }

  function resolveAiAvailability(options) {
    var safeOptions = options && typeof options === "object" ? options : {};
    if (typeof safeOptions.aiAvailable === "boolean") {
      return safeOptions.aiAvailable;
    }
    if (typeof safeOptions.isAiAvailable === "boolean") {
      return safeOptions.isAiAvailable;
    }
    if (safeOptions.aiStatus && typeof safeOptions.aiStatus.available === "boolean") {
      return safeOptions.aiStatus.available;
    }
    return null;
  }

  function normalizeTemplates(source) {
    if (source && typeof source === "object" && !Array.isArray(source) && Array.isArray(source.templates)) {
      source = source.templates;
    }
    if (!Array.isArray(source)) {
      source = DEFAULT_TEMPLATES;
    }

    var normalized = source
      .filter(function (template) {
        return template && typeof template === "object" && template.spec && typeof template.spec === "object";
      })
      .map(function (template, index) {
        var copy = Object.assign({}, template);
        if (!copy.id) {
          copy.id = String(copy.slug || copy.label || copy.title || ("template-" + index));
        }
        copy.label = copy.label || copy.title || copy.id;
        copy.description = copy.description || "";
        copy.slideCount = copy.slideCount || (copy.spec && copy.spec.slides ? copy.spec.slides.length : 0);
        return copy;
      });

    return normalized.length ? normalized : DEFAULT_TEMPLATES.map(function (template) {
      return Object.assign({}, template);
    });
  }

  function readExistingSlugSource(source) {
    if (typeof source === "function") {
      try {
        return source();
      } catch (err) {
        return [];
      }
    }
    return source;
  }

  function normalizeExistingSlugs(source) {
    if (!Array.isArray(source)) {
      return [];
    }

    var seen = Object.create(null);
    return source
      .map(function (value) {
        return String(value || "").trim();
      })
      .filter(function (value) {
        if (!value || seen[value]) {
          return false;
        }
        seen[value] = true;
        return true;
      });
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () {
          return {};
        }).then(function (data) {
          throw new Error(data.error || ("Request failed: " + res.status));
        });
      }
      return res.json();
    });
  }

  function getTemplates() {
    if (typeof state.options.getTemplates === "function") {
      return Promise.resolve(state.options.getTemplates()).then(function (templates) {
        var normalized = normalizeTemplates(templates);
        if (normalized.length) {
          state.templates = normalized;
        }
        return state.templates.slice();
      }).catch(function () {
        return state.templates.slice();
      });
    }

    if (Array.isArray(state.options.templates) && state.options.templates.length) {
      return Promise.resolve(normalizeTemplates(state.options.templates));
    }

    return fetchJson("/api/templates")
      .then(function (templates) {
        return normalizeTemplates(templates);
      })
      .catch(function () {
        return state.templates.slice();
      });
  }

  function getExistingSlugs() {
    var source = normalizeExistingSlugs(readExistingSlugSource(state.options.getExistingSlugs || state.options.existingSlugs));
    return normalizeExistingSlugs(state.existingSlugs.concat(source));
  }

  function loadExistingSlugs() {
    if (typeof state.options.getExistingSlugs === "function" || Array.isArray(state.options.existingSlugs)) {
      return Promise.resolve(getExistingSlugs());
    }

    return fetchJson("/api/specs")
      .then(function (specs) {
        return normalizeExistingSlugs((Array.isArray(specs) ? specs : []).map(function (item) {
          if (typeof item === "string") {
            return item;
          }
          return item && typeof item === "object" ? item.slug : "";
        }));
      })
      .catch(function () {
        return getExistingSlugs();
      });
  }

  function validateSlug(slug, existingSlugs) {
    var safeSlug = String(slug || "").trim();
    if (!safeSlug) {
      return "Enter a slug to create a new spec.";
    }
    if (!SLUG_PATTERN.test(safeSlug)) {
      return "Use lowercase letters, numbers, and single hyphens only.";
    }
    if (Array.isArray(existingSlugs) && existingSlugs.includes(safeSlug)) {
      return "A spec with this slug already exists.";
    }
    return "";
  }

  function getActiveTabConfig() {
    return getTabConfig().find(function (tab) {
      return tab.key === state.activeTab;
    }) || getTabConfig()[0];
  }

  function getTabConfig() {
    return BASE_TABS.map(function (tab) {
      if (tab.key === "blank") {
        return Object.assign({}, tab, { disabled: false, badge: "" });
      }
      if (state.aiAvailable == null) {
        return Object.assign({}, tab, { disabled: false, badge: "Checking…" });
      }
      if (state.aiAvailable) {
        return Object.assign({}, tab, { disabled: false, badge: "" });
      }
      return Object.assign({}, tab, { disabled: false, badge: "AI off" });
    });
  }

  function getSelectedTemplate() {
    return state.templates.find(function (template) {
      return template.id === state.selectedTemplateId;
    }) || null;
  }

  function ensureDom(mountNode) {
    if (!modalRoot) {
      if (typeof document === "undefined") {
        throw new Error("CreationFlow.open() requires a browser document.");
      }

      modalRoot = document.createElement("div");
      modalRoot.className = "creation-flow hidden";
      modalRoot.setAttribute("aria-hidden", "true");
      modalRoot.innerHTML = [
        '<div class="creation-flow__backdrop" data-action="close"></div>',
        '<div class="creation-flow__dialog" role="dialog" aria-modal="true" aria-labelledby="creationFlowTitle">',
        '  <div class="creation-flow__header">',
        '    <div>',
        '      <h2 class="creation-flow__title" id="creationFlowTitle">Create new spec</h2>',
        '      <p class="creation-flow__description"></p>',
        '    </div>',
        '    <button type="button" class="creation-flow__close" data-action="close" aria-label="Close creation modal">×</button>',
        '  </div>',
        '  <div class="creation-flow__tabs" role="tablist" aria-label="Creation methods"></div>',
        '  <div class="creation-flow__body">',
        '    <div class="creation-flow__section">',
        '      <label class="creation-flow__label" for="creationFlowSlug">Slug</label>',
        '      <input id="creationFlowSlug" name="slug" class="creation-flow__input" type="text" autocomplete="off" spellcheck="false">',
        '      <div class="creation-flow__help"></div>',
        '      <div class="creation-flow__error hidden" role="alert"></div>',
        '    </div>',
        '    <div class="creation-flow__panel" data-panel="blank">',
        '      <div class="creation-flow__panel-intro">Pick a template or create a blank draft.</div>',
        '      <div class="creation-flow__template-grid"></div>',
        '      <div class="creation-flow__actions">',
        '        <button type="button" class="creation-flow__secondary" data-action="close">Cancel</button>',
        '        <button type="button" class="creation-flow__primary" data-action="create-blank">Create blank spec</button>',
        '      </div>',
        '    </div>',
        '    <div class="creation-flow__panel hidden" data-panel="text">',
        '      <label class="creation-flow__label" for="creationFlowText">Source text</label>',
        '      <textarea id="creationFlowText" class="creation-flow__textarea" placeholder="Paste article text, notes, or a transcript."></textarea>',
        '      <div class="creation-flow__meta-row">',
        '        <span class="creation-flow__char-count">0 / 50000</span>',
        '      </div>',
        '      <div class="creation-flow__generation-options" data-generation-options="text"></div>',
        '      <div class="creation-flow__draft hidden" data-draft="text"></div>',
        '      <div class="creation-flow__actions">',
        '        <button type="button" class="creation-flow__secondary" data-action="close">Cancel</button>',
        '        <button type="button" class="creation-flow__secondary hidden" data-action="regenerate-text">Regenerate</button>',
        '        <button type="button" class="creation-flow__primary" data-action="generate-text">Generate Card News</button>',
        '        <button type="button" class="creation-flow__primary hidden" data-action="save-text">Save &amp; Open</button>',
        '      </div>',
        '    </div>',
        '    <div class="creation-flow__panel hidden" data-panel="url">',
        '      <label class="creation-flow__label" for="creationFlowUrl">Article URL</label>',
        '      <div class="creation-flow__row">',
        '        <input id="creationFlowUrl" class="creation-flow__input" type="url" placeholder="https://example.com/story">',
        '        <button type="button" class="creation-flow__secondary creation-flow__inline-btn" data-action="fetch-url">Fetch</button>',
        '      </div>',
        '      <label class="creation-flow__label" for="creationFlowUrlText">Fetched text</label>',
        '      <textarea id="creationFlowUrlText" class="creation-flow__textarea" placeholder="Fetched article text will appear here."></textarea>',
        '      <div class="creation-flow__meta-row">',
        '        <span class="creation-flow__fetch-meta"></span>',
        '      </div>',
        '      <div class="creation-flow__generation-options" data-generation-options="url"></div>',
        '      <div class="creation-flow__draft hidden" data-draft="url"></div>',
        '      <div class="creation-flow__actions">',
        '        <button type="button" class="creation-flow__secondary" data-action="close">Cancel</button>',
        '        <button type="button" class="creation-flow__secondary hidden" data-action="regenerate-url">Regenerate</button>',
        '        <button type="button" class="creation-flow__primary" data-action="generate-url">Generate Card News</button>',
        '        <button type="button" class="creation-flow__primary hidden" data-action="save-url">Save &amp; Open</button>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>',
      ].join("");

      refs = {
        root: modalRoot,
        dialog: modalRoot.querySelector(".creation-flow__dialog"),
        title: modalRoot.querySelector(".creation-flow__title"),
        description: modalRoot.querySelector(".creation-flow__description"),
        tabs: modalRoot.querySelector(".creation-flow__tabs"),
        slugInput: modalRoot.querySelector("#creationFlowSlug"),
        slugHelp: modalRoot.querySelector(".creation-flow__help"),
        error: modalRoot.querySelector(".creation-flow__error"),
        panels: modalRoot.querySelectorAll(".creation-flow__panel"),
        templateGrid: modalRoot.querySelector(".creation-flow__template-grid"),
        blankSubmit: modalRoot.querySelector('[data-action="create-blank"]'),
        textInput: modalRoot.querySelector("#creationFlowText"),
        textCharCount: modalRoot.querySelector(".creation-flow__char-count"),
        textGenerate: modalRoot.querySelector('[data-action="generate-text"]'),
        textRegenerate: modalRoot.querySelector('[data-action="regenerate-text"]'),
        textSave: modalRoot.querySelector('[data-action="save-text"]'),
        textGenerationOptions: modalRoot.querySelector('[data-generation-options="text"]'),
        textDraft: modalRoot.querySelector('[data-draft="text"]'),
        urlInput: modalRoot.querySelector("#creationFlowUrl"),
        urlFetch: modalRoot.querySelector('[data-action="fetch-url"]'),
        urlText: modalRoot.querySelector("#creationFlowUrlText"),
        urlGenerate: modalRoot.querySelector('[data-action="generate-url"]'),
        urlRegenerate: modalRoot.querySelector('[data-action="regenerate-url"]'),
        urlSave: modalRoot.querySelector('[data-action="save-url"]'),
        urlGenerationOptions: modalRoot.querySelector('[data-generation-options="url"]'),
        urlDraft: modalRoot.querySelector('[data-draft="url"]'),
        fetchMeta: modalRoot.querySelector(".creation-flow__fetch-meta"),
        closeButtons: modalRoot.querySelectorAll('[data-action="close"]'),
      };

      bindDomEvents();
    }

    var target = mountNode && mountNode.nodeType === 1 ? mountNode : document.body;
    if (modalRoot.parentNode !== target) {
      target.appendChild(modalRoot);
    }
  }

  function bindDomEvents() {
    Array.prototype.forEach.call(refs.closeButtons, function (button) {
      button.addEventListener("click", function () {
        requestClose(null);
      });
    });

    modalRoot.querySelector(".creation-flow__backdrop").addEventListener("click", function () {
      requestClose(null);
    });

    refs.slugInput.addEventListener("input", function () {
      state.slug = refs.slugInput.value.trim();
      clearError();
      syncDom();
    });

    refs.textInput.addEventListener("input", function () {
      state.textInput = refs.textInput.value;
      clearError();
      syncDom();
    });

    refs.urlInput.addEventListener("input", function () {
      state.urlInput = refs.urlInput.value.trim();
      clearError();
      syncDom();
    });

    refs.urlText.addEventListener("input", function () {
      state.fetchedText = refs.urlText.value;
      clearError();
      syncDom();
    });

    modalRoot.addEventListener("click", function (event) {
      var chip = event.target.closest("[data-generation-key]");
      if (!chip || chip.disabled || state.busy) {
        return;
      }

      var groupKey = chip.getAttribute("data-generation-key");
      var optionValue = chip.getAttribute("data-generation-value");
      if (!groupKey) {
        return;
      }

      state.generationOptions[groupKey] = normalizeGenerationOptionValue(groupKey, optionValue);
      state.draft = null;
      clearError();
      syncDom();
    });

    refs.blankSubmit.addEventListener("click", submitBlank);
    refs.textGenerate.addEventListener("click", submitTextGenerate);
    refs.textRegenerate.addEventListener("click", submitTextGenerate);
    refs.textSave.addEventListener("click", submitTextSave);
    refs.urlFetch.addEventListener("click", submitFetchUrl);
    refs.urlGenerate.addEventListener("click", submitUrlGenerate);
    refs.urlRegenerate.addEventListener("click", submitUrlGenerate);
    refs.urlSave.addEventListener("click", submitUrlSave);

    document.addEventListener("keydown", handleDocumentKeydown, true);
  }

  function handleDocumentKeydown(event) {
    if (!state.open) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose(null);
    }
  }

  function clearError() {
    if (state.error) {
      state.error = "";
    }
  }

  function buildTabs() {
    refs.tabs.innerHTML = "";
    getTabConfig().forEach(function (tab) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "creation-flow__tab" + (state.activeTab === tab.key ? " is-active" : "");
      button.dataset.tab = tab.key;
      button.disabled = Boolean(tab.disabled);
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", state.activeTab === tab.key ? "true" : "false");
      button.textContent = tab.label;
      if (tab.badge) {
        var badge = document.createElement("span");
        badge.className = "creation-flow__badge";
        badge.textContent = tab.badge;
        button.appendChild(badge);
      }
      button.addEventListener("click", function () {
        if (tab.disabled || state.busy) {
          return;
        }
        state.activeTab = tab.key;
        clearError();
        syncDom();
      });
      refs.tabs.appendChild(button);
    });
  }

  function renderTemplates() {
    refs.templateGrid.innerHTML = "";

    if (!state.templates.length) {
      var empty = document.createElement("div");
      empty.className = "creation-flow__empty";
      empty.textContent = "No templates available right now. Create a blank draft instead.";
      refs.templateGrid.appendChild(empty);
      return;
    }

    state.templates.forEach(function (template) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "creation-flow__template-card" + (template.id === state.selectedTemplateId ? " is-selected" : "");
      button.dataset.templateId = template.id;
      button.innerHTML = [
        '<span class="creation-flow__template-title">' + escapeHtml(template.label) + '</span>',
        '<span class="creation-flow__template-meta">' + escapeHtml(String(template.slideCount || 0)) + ' slides</span>',
        template.description ? '<span class="creation-flow__template-description">' + escapeHtml(template.description) + '</span>' : "",
      ].join("");
      button.addEventListener("click", function () {
        if (state.busy) {
          return;
        }
        state.selectedTemplateId = template.id === state.selectedTemplateId ? "" : template.id;
        syncDom();
      });
      refs.templateGrid.appendChild(button);
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getDraftSummaryHtml(draft) {
    if (!draft || !draft.spec) {
      return "";
    }

    var generationOptions = cloneGenerationOptions(draft.generationOptions);
    var optionChips = [
      "Tone: " + getGenerationOptionLabel("tone", generationOptions.tone),
      "Density: " + getGenerationOptionLabel("density", generationOptions.density),
      "Intent: " + getGenerationOptionLabel("intent", generationOptions.intent),
      "Slides: " + getGenerationOptionLabel("slideCount", generationOptions.slideCount),
    ].map(function (label) {
      return '<span class="creation-flow__chip">' + escapeHtml(label) + '</span>';
    }).join("");

    var slideTitles = Array.isArray(draft.spec.slides)
      ? draft.spec.slides.map(function (slide) {
          return (slide.slide || "?") + ". " + escapeHtml(slide.title || "Untitled");
        }).join("<br>")
      : "";

    return [
      '<div class="creation-flow__draft-summary">',
      '  <div class="creation-flow__draft-title">' + escapeHtml(draft.spec.meta && draft.spec.meta.title || "Generated draft") + '</div>',
      '  <div class="creation-flow__draft-meta">' + escapeHtml(String(draft.spec.slides ? draft.spec.slides.length : 0)) + ' slides</div>',
      '  <div class="creation-flow__chip-row">' + optionChips + '</div>',
      slideTitles ? '  <div class="creation-flow__draft-slides">' + slideTitles + '</div>' : "",
      '  <pre class="creation-flow__draft-code">' + escapeHtml(JSON.stringify(draft.spec, null, 2)) + '</pre>',
      '</div>',
    ].join("");
  }

  function renderGenerationOptions(panelKey) {
    var target = panelKey === "text" ? refs.textGenerationOptions : refs.urlGenerationOptions;
    if (!target) {
      return;
    }

    target.innerHTML = "";
    GENERATION_OPTION_GROUPS.forEach(function (group) {
      var section = document.createElement("div");
      section.className = "creation-flow__option-group";

      var label = document.createElement("div");
      label.className = "creation-flow__option-label";
      label.textContent = group.label;
      section.appendChild(label);

      var list = document.createElement("div");
      list.className = "creation-flow__option-choices";

      group.options.forEach(function (option) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "creation-flow__option-chip" + (
          String(state.generationOptions[group.key]) === String(option.value) ? " is-selected" : ""
        );
        button.setAttribute("data-generation-key", group.key);
        button.setAttribute("data-generation-value", String(option.value));
        button.disabled = state.busy;
        button.textContent = option.label;
        list.appendChild(button);
      });

      section.appendChild(list);
      target.appendChild(section);
    });
  }

  function syncDraftPanel(panelKey) {
    var draft = state.draft && state.draft.mode === panelKey ? state.draft : null;
    var draftRef = panelKey === "text" ? refs.textDraft : refs.urlDraft;
    var saveButton = panelKey === "text" ? refs.textSave : refs.urlSave;
    var regenButton = panelKey === "text" ? refs.textRegenerate : refs.urlRegenerate;
    var generateButton = panelKey === "text" ? refs.textGenerate : refs.urlGenerate;

    if (!draft) {
      draftRef.innerHTML = "";
      draftRef.classList.add("hidden");
      saveButton.classList.add("hidden");
      regenButton.classList.add("hidden");
      generateButton.classList.remove("hidden");
      return;
    }

    draftRef.innerHTML = getDraftSummaryHtml(draft);
    draftRef.classList.remove("hidden");
    saveButton.classList.remove("hidden");
    regenButton.classList.remove("hidden");
    generateButton.classList.add("hidden");
  }

  function syncDom() {
    if (!refs) {
      return;
    }

    refs.root.classList.toggle("hidden", !state.open);
    refs.root.classList.toggle("creation-flow--open", state.open);
    refs.root.setAttribute("aria-hidden", state.open ? "false" : "true");

    refs.title.textContent = state.options.title || "Create new spec";
    refs.description.textContent = state.options.description || "Start blank, use a template, or generate a card-news draft.";
    refs.slugHelp.textContent = state.options.slugHelp || "Use lowercase letters, numbers, and single hyphens only.";

    if (refs.slugInput.value !== state.slug) {
      refs.slugInput.value = state.slug;
    }
    refs.slugInput.disabled = state.busy;

    var slugError = validateSlug(state.slug, getExistingSlugs());
    var displayError = state.error || "";

    if (displayError) {
      refs.error.textContent = displayError;
      refs.error.classList.remove("hidden");
    } else if (state.slug && slugError) {
      refs.error.textContent = slugError;
      refs.error.classList.remove("hidden");
    } else {
      refs.error.textContent = "";
      refs.error.classList.add("hidden");
    }

    buildTabs();
    renderTemplates();

    Array.prototype.forEach.call(refs.panels, function (panel) {
      panel.classList.toggle("hidden", panel.getAttribute("data-panel") !== state.activeTab);
    });

    refs.blankSubmit.disabled = state.busy || Boolean(slugError) || !state.slug;
    refs.blankSubmit.textContent = state.busy && state.pendingLabel === "Creating…"
      ? "Creating…"
      : (getSelectedTemplate() ? "Create from template" : "Create blank spec");

    refs.textInput.disabled = state.busy;
    refs.textInput.value = state.textInput;
    refs.textCharCount.textContent = String(state.textInput.length) + " / " + String(MAX_TEXT_LENGTH);
    refs.textGenerate.disabled = state.busy || !state.aiAvailable || !state.textInput.trim() || state.textInput.length > MAX_TEXT_LENGTH;
    refs.textRegenerate.disabled = refs.textGenerate.disabled;
    refs.textSave.disabled = state.busy || Boolean(slugError) || !state.slug;
    refs.textGenerate.textContent = state.busy && state.pendingLabel === "Generating…" && state.activeTab === "text"
      ? "Generating…"
      : "Generate Card News";
    refs.textSave.textContent = state.busy && state.pendingLabel === "Saving…" && state.draft && state.draft.mode === "text"
      ? "Saving…"
      : "Save & Open";

    refs.urlInput.disabled = state.busy;
    refs.urlText.disabled = state.busy;
    refs.urlInput.value = state.urlInput;
    refs.urlText.value = state.fetchedText;
    refs.urlFetch.disabled = state.busy || !state.urlInput.trim();
    refs.urlGenerate.disabled = state.busy || !state.aiAvailable || !state.fetchedText.trim();
    refs.urlRegenerate.disabled = refs.urlGenerate.disabled;
    refs.urlSave.disabled = state.busy || Boolean(slugError) || !state.slug;
    refs.urlFetch.textContent = state.busy && state.pendingLabel === "Fetching…"
      ? "Fetching…"
      : "Fetch";
    refs.urlGenerate.textContent = state.busy && state.pendingLabel === "Generating…" && state.activeTab === "url"
      ? "Generating…"
      : "Generate Card News";
    refs.urlSave.textContent = state.busy && state.pendingLabel === "Saving…" && state.draft && state.draft.mode === "url"
      ? "Saving…"
      : "Save & Open";
    refs.fetchMeta.textContent = state.fetchedTitle
      ? state.fetchedTitle + (state.fetchedSource ? " · " + state.fetchedSource : "")
      : (state.aiAvailable == null
        ? "Checking AI availability…"
        : (state.aiAvailable
          ? "Fetch an article, review the extracted text, then generate."
          : "AI URL generation is unavailable right now."));

    renderGenerationOptions("text");
    renderGenerationOptions("url");
    syncDraftPanel("text");
    syncDraftPanel("url");
  }

  function withBusy(label, task) {
    if (state.busy) {
      return Promise.resolve(null);
    }

    state.busy = true;
    state.pendingLabel = label;
    clearError();
    syncDom();

    return Promise.resolve()
      .then(task)
      .finally(function () {
        state.busy = false;
        state.pendingLabel = "";
        syncDom();
      });
  }

  function buildCreatePayload(spec) {
    return {
      slug: state.slug,
      spec: spec,
      mode: state.activeTab,
      draft: state.draft,
      template: getSelectedTemplate(),
    };
  }

  function submitBlank() {
    var slugError = validateSlug(state.slug, getExistingSlugs());
    if (slugError) {
      state.error = slugError;
      syncDom();
      refs.slugInput.focus();
      return Promise.resolve(null);
    }

    var template = getSelectedTemplate();
    return withBusy("Creating…", function () {
      var handler = state.options.onCreate || state.options.createSpec || state.options.onSaveDraft;
      if (typeof handler !== "function") {
        finalize(buildCreatePayload(template ? template.spec : undefined));
        return null;
      }
      return Promise.resolve(handler(buildCreatePayload(template ? template.spec : undefined))).then(function (result) {
        finalize(result || buildCreatePayload(template ? template.spec : undefined));
        return result;
      }).catch(function (err) {
        state.error = err && err.message ? err.message : "Failed to create spec.";
        syncDom();
        return null;
      });
    });
  }

  function submitTextGenerate() {
    if (!state.aiAvailable) {
      return Promise.resolve(null);
    }
    if (state.textInput.length > MAX_TEXT_LENGTH) {
      state.error = "Text must be 50,000 characters or fewer.";
      syncDom();
      return Promise.resolve(null);
    }

    return withBusy("Generating…", function () {
      var handler = state.options.onGenerate || state.options.generateSpec;
      var request = {
        text: state.textInput,
        mode: "text",
        generationOptions: cloneGenerationOptions(state.generationOptions),
      };
      var task = typeof handler === "function"
        ? Promise.resolve(handler(request))
        : fetchJson("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          });

      return task
        .then(function (result) {
          var spec = result && result.spec ? result.spec : result;
          if (!spec || typeof spec !== "object") {
            throw new Error("Generation returned an invalid draft.");
          }
          state.draft = {
            mode: "text",
            spec: spec,
            result: result || { spec: spec },
            generationOptions: cloneGenerationOptions(state.generationOptions),
          };
          syncDom();
          return result;
        })
        .catch(function (err) {
          state.error = err && err.message ? err.message : "Failed to generate draft.";
          syncDom();
          return null;
        });
    });
  }

  function submitTextSave() {
    var slugError = validateSlug(state.slug, getExistingSlugs());
    if (slugError) {
      state.error = slugError;
      syncDom();
      refs.slugInput.focus();
      return Promise.resolve(null);
    }
    if (!state.draft || state.draft.mode !== "text") {
      return Promise.resolve(null);
    }

    return withBusy("Saving…", function () {
      var handler = state.options.onSaveDraft || state.options.onOpenDraft || state.options.onCreate || state.options.createSpec;
      if (typeof handler !== "function") {
        finalize(buildCreatePayload(state.draft.spec));
        return null;
      }
      return Promise.resolve(handler(buildCreatePayload(state.draft.spec))).then(function (result) {
        finalize(result || buildCreatePayload(state.draft.spec));
        return result;
      }).catch(function (err) {
        state.error = err && err.message ? err.message : "Failed to save draft.";
        syncDom();
        return null;
      });
    });
  }

  function submitFetchUrl() {
    return withBusy("Fetching…", function () {
      var handler = state.options.onFetchUrl || state.options.onFetchArticle || state.options.fetchArticle;
      var request = { url: state.urlInput };
      var task = typeof handler === "function"
        ? Promise.resolve(handler(request))
        : fetchJson("/api/fetch-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          });

      return task
        .then(function (result) {
          state.fetchedTitle = String(result && result.title || "");
          state.fetchedSource = String(result && (result.source || result.url) || state.urlInput || "");
          state.fetchedText = String(result && (result.content || result.text) || "");
          refs.urlText.value = state.fetchedText;
          syncDom();
          return result;
        })
        .catch(function (err) {
          state.error = err && err.message ? err.message : "Failed to fetch the URL.";
          syncDom();
          return null;
        });
    });
  }

  function submitUrlGenerate() {
    if (!state.aiAvailable) {
      return Promise.resolve(null);
    }
    if (!state.fetchedText.trim()) {
      state.error = "Fetch an article and review the extracted text first.";
      syncDom();
      return Promise.resolve(null);
    }

    return withBusy("Generating…", function () {
      var handler = state.options.onGenerate || state.options.generateSpec;
      var request = {
        text: state.fetchedText,
        url: state.urlInput,
        source: state.fetchedSource,
        title: state.fetchedTitle,
        mode: "url",
        generationOptions: cloneGenerationOptions(state.generationOptions),
      };
      var task = typeof handler === "function"
        ? Promise.resolve(handler(request))
        : fetchJson("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          });

      return task
        .then(function (result) {
          var spec = result && result.spec ? result.spec : result;
          if (!spec || typeof spec !== "object") {
            throw new Error("Generation returned an invalid draft.");
          }
          state.draft = {
            mode: "url",
            spec: spec,
            result: result || { spec: spec },
            generationOptions: cloneGenerationOptions(state.generationOptions),
          };
          syncDom();
          return result;
        })
        .catch(function (err) {
          state.error = err && err.message ? err.message : "Failed to generate draft.";
          syncDom();
          return null;
        });
    });
  }

  function submitUrlSave() {
    var slugError = validateSlug(state.slug, getExistingSlugs());
    if (slugError) {
      state.error = slugError;
      syncDom();
      refs.slugInput.focus();
      return Promise.resolve(null);
    }
    if (!state.draft || state.draft.mode !== "url") {
      return Promise.resolve(null);
    }

    return withBusy("Saving…", function () {
      var handler = state.options.onSaveDraft || state.options.onOpenDraft || state.options.onCreate || state.options.createSpec;
      if (typeof handler !== "function") {
        finalize(buildCreatePayload(state.draft.spec));
        return null;
      }
      return Promise.resolve(handler(buildCreatePayload(state.draft.spec))).then(function (result) {
        finalize(result || buildCreatePayload(state.draft.spec));
        return result;
      }).catch(function (err) {
        state.error = err && err.message ? err.message : "Failed to save draft.";
        syncDom();
        return null;
      });
    });
  }

  function requestClose(result) {
    if (state.busy) {
      return;
    }
    finalize(result);
  }

  function finalize(result) {
    if (!state.open) {
      return;
    }

    openToken += 1;
    state = createDefaultState();
    syncDom();

    if (typeof resolveOpen === "function") {
      var resolver = resolveOpen;
      resolveOpen = null;
      resolver(result == null ? null : result);
    }

    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      try {
        lastFocusedElement.focus({ preventScroll: true });
      } catch {
        lastFocusedElement.focus();
      }
    }
    lastFocusedElement = null;
  }

  function open(options) {
    ensureDom(options && (options.root || options.mountNode || options.portalTarget || options.container));

    if (state.open) {
      finalize(null);
    }

    var token = ++openToken;
    state = createDefaultState(options);
    state.open = true;
    lastFocusedElement = document.activeElement;
    syncDom();

    return Promise.all([
      getTemplates(),
      loadExistingSlugs(),
      (typeof state.aiAvailable === "boolean"
        ? Promise.resolve(state.aiAvailable)
        : fetchJson("/api/ai-status").then(function (payload) {
            return Boolean(payload && payload.available);
          }).catch(function () {
            return false;
          })),
    ]).then(function (results) {
      if (token !== openToken || !state.open) {
        return null;
      }

      if (results[0] && results[0].length) {
        state.templates = normalizeTemplates(results[0]);
      }
      state.existingSlugs = normalizeExistingSlugs(results[1]);
      state.aiAvailable = results[2];
      syncDom();

      window.requestAnimationFrame(function () {
        refs.slugInput.focus();
        refs.slugInput.select();
      });
      return new Promise(function (resolve) {
        resolveOpen = resolve;
      });
    });
  }

  function close() {
    requestClose(null);
  }

  function isOpen() {
    return Boolean(state.open);
  }

  return {
    SLUG_PATTERN: SLUG_PATTERN,
    MAX_TEXT_LENGTH: MAX_TEXT_LENGTH,
    validateSlug: validateSlug,
    open: open,
    close: close,
    isOpen: isOpen,
  };
});
