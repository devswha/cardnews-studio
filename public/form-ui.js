// form-ui.js — Form generation from block schemas + DOM manipulation
// Depends on: block-schemas.js (BLOCK_SCHEMAS, LAYOUT_OPTIONS), schema-defaults.js (SchemaDefaults)

var FormUI = (function () {
  "use strict";

  function destroySortableInstance(container, key) {
    if (!container || !container[key] || typeof container[key].destroy !== "function") {
      return;
    }
    container[key].destroy();
    container[key] = null;
  }

  function stopClickPropagation(event) {
    event.stopPropagation();
  }

  function createDragHandle(className, label) {
    var handle = document.createElement("button");
    handle.type = "button";
    handle.className = className;
    handle.title = label;
    handle.setAttribute("aria-label", label);
    handle.textContent = "\u22ee\u22ee";
    handle.addEventListener("click", stopClickPropagation);
    return handle;
  }

  function createSlideAiActionButton(action, label, callbacks, context) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "slide-ai-btn";
    button.dataset.action = action;
    button.textContent = label;

    var isBusy = callbacks && typeof callbacks.isSlideAiBusy === "function"
      ? Boolean(callbacks.isSlideAiBusy())
      : false;
    var isActive = callbacks && typeof callbacks.isSlideAiActionRunning === "function"
      ? Boolean(callbacks.isSlideAiActionRunning(action))
      : false;
    var isDisabled = callbacks && typeof callbacks.isSlideAiActionDisabled === "function"
      ? Boolean(callbacks.isSlideAiActionDisabled(context.index, context.slide, action))
      : false;

    if (isActive) {
      button.textContent = "Working…";
    }
    button.disabled = isBusy || isDisabled;
    button.title = isDisabled && action === "suggest-layout"
      ? "Layout suggestions are available for middle slides only."
      : label;
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!callbacks || typeof callbacks.onAiSlideAction !== "function" || button.disabled) {
        return;
      }
      callbacks.onAiSlideAction(context.index, context.slide.slide || (context.index + 1), action);
    });
    return button;
  }

  function createSlideSortable(listEl, state, callbacks) {
    if (!listEl || typeof Sortable === "undefined" || !state || state.getSlides().length < 2) {
      return null;
    }

    return Sortable.create(listEl, {
      draggable: ".slide-card",
      handle: ".slide-card-drag-handle",
      animation: 160,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      onEnd: function (evt) {
        if (
          !evt ||
          typeof evt.oldIndex !== "number" ||
          typeof evt.newIndex !== "number" ||
          evt.oldIndex === evt.newIndex
        ) {
          return;
        }

        state.moveSlide(evt.oldIndex, evt.newIndex);
        if (callbacks && typeof callbacks.onSelectSlide === "function") {
          callbacks.onSelectSlide(evt.newIndex, evt.newIndex + 1);
        }
      },
    });
  }

  function createBlockSortable(listEl, state, slideIndex) {
    if (!listEl || typeof Sortable === "undefined" || !state || state.getBlocks(slideIndex).length < 2) {
      return null;
    }

    return Sortable.create(listEl, {
      draggable: ".block-item",
      handle: ".block-drag-handle",
      animation: 160,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      onEnd: function (evt) {
        if (
          !evt ||
          typeof evt.oldIndex !== "number" ||
          typeof evt.newIndex !== "number" ||
          evt.oldIndex === evt.newIndex
        ) {
          return;
        }

        state.moveBlock(slideIndex, evt.oldIndex, evt.newIndex);
      },
    });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function createDefaultObject(fields) {
    if (typeof SchemaDefaults !== "undefined" && SchemaDefaults.createDefaultObjectFromFields) {
      return SchemaDefaults.createDefaultObjectFromFields(fields);
    }

    var result = {};
    (fields || []).forEach(function (fieldDef) {
      if (!fieldDef || !fieldDef.key) return;
      result[fieldDef.key] = fieldDef.type === "array" ? [] : fieldDef.type === "object" ? {} : "";
    });
    return result;
  }

  // ── Field Generators ────────────────────────────────────────────────────────

  function createFieldInput(fieldDef, value, onInput, options) {
    var fieldOptions = options || {};
    var group = document.createElement("div");
    group.className = "form-group";

    var label = document.createElement("label");
    label.textContent = fieldDef.label;
    if (fieldDef.optional) {
      var opt = document.createElement("span");
      opt.className = "optional-label";
      opt.textContent = "(optional)";
      label.appendChild(opt);
    }
    group.appendChild(label);

    var input;
    if (fieldDef.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 3;
      input.value = value != null ? String(value) : "";
    } else if (fieldDef.type === "select") {
      input = document.createElement("select");
      if (fieldDef.optional) {
        var emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = "-- none --";
        input.appendChild(emptyOpt);
      }
      (fieldDef.options || []).forEach(function (optVal) {
        var o = document.createElement("option");
        o.value = optVal;
        o.textContent = optVal;
        if (String(optVal) === String(value)) o.selected = true;
        input.appendChild(o);
      });
    } else if (fieldDef.type === "number") {
      input = document.createElement("input");
      input.type = "number";
      input.value = value != null ? value : "";
    } else {
      input = document.createElement("input");
      input.type = "text";
      input.value = value != null ? String(value) : "";
    }

    if (fieldDef.placeholder) input.placeholder = fieldDef.placeholder;
    if (fieldOptions.focusKey) input.dataset.focusKey = fieldOptions.focusKey;

    input.addEventListener("input", function () {
      var v = input.value;
      if (fieldDef.type === "number" && v !== "") v = Number(v);
      onInput(v);
    });

    group.appendChild(input);
    return group;
  }

  // ── Object Fields (e.g., before-after.before) ───────────────────────────────

  function createObjectField(fieldDef, dataObj, onUpdate, options) {
    var fieldOptions = options || {};
    var wrapper = document.createElement("div");
    wrapper.className = "array-item";

    var header = document.createElement("div");
    header.className = "array-item-header";
    var lbl = document.createElement("span");
    lbl.className = "array-item-label";
    lbl.textContent = fieldDef.label;
    header.appendChild(lbl);
    wrapper.appendChild(header);

    var obj = dataObj || {};
    (fieldDef.fields || []).forEach(function (subField) {
      var el = createFieldInput(
        subField,
        obj[subField.key],
        function (v) {
          onUpdate(subField.key, v);
        },
        { focusKey: fieldOptions.pathPrefix ? fieldOptions.pathPrefix + "." + subField.key : subField.key }
      );
      wrapper.appendChild(el);
    });

    return wrapper;
  }

  // ── Array Fields (items, lines, rows, cells) ────────────────────────────────

  function createArrayField(fieldDef, dataArray, onUpdate, options) {
    var fieldOptions = options || {};
    var wrapper = document.createElement("div");
    wrapper.className = "array-field";

    var lbl = document.createElement("label");
    lbl.textContent = fieldDef.label;
    wrapper.appendChild(lbl);

    var itemsContainer = document.createElement("div");
    wrapper.appendChild(itemsContainer);

    function renderItems() {
      itemsContainer.innerHTML = "";
      var arr = dataArray || [];
      arr.forEach(function (item, idx) {
        var itemEl = document.createElement("div");
        itemEl.className = "array-item";

        var itemHeader = document.createElement("div");
        itemHeader.className = "array-item-header";
        var itemLabel = document.createElement("span");
        itemLabel.className = "array-item-label";
        itemLabel.textContent = "#" + (idx + 1);
        itemHeader.appendChild(itemLabel);

        var actions = document.createElement("div");
        actions.className = "array-item-actions";

        if (idx > 0) {
          var upBtn = document.createElement("button");
          upBtn.textContent = "\u2191";
          upBtn.title = "Move up";
          upBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            onUpdate("move", idx, idx - 1);
          });
          actions.appendChild(upBtn);
        }
        if (idx < arr.length - 1) {
          var downBtn = document.createElement("button");
          downBtn.textContent = "\u2193";
          downBtn.title = "Move down";
          downBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            onUpdate("move", idx, idx + 1);
          });
          actions.appendChild(downBtn);
        }

        var delBtn = document.createElement("button");
        delBtn.textContent = "\u00d7";
        delBtn.title = "Remove";
        delBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          onUpdate("remove", idx);
        });
        actions.appendChild(delBtn);

        itemHeader.appendChild(actions);
        itemEl.appendChild(itemHeader);

        // Render sub-fields for this array item
        (fieldDef.itemSchema || []).forEach(function (subField) {
          var childPath = fieldOptions.pathPrefix
            ? fieldOptions.pathPrefix + "." + idx + "." + subField.key
            : String(idx) + "." + subField.key;
          if (subField.type === "array") {
            // Nested array (e.g., table rows -> cells)
            var nestedEl = createArrayField(subField, item[subField.key], function (action, a, b) {
              if (action === "add") {
                if (!item[subField.key]) item[subField.key] = [];
                item[subField.key].push(createDefaultObject(subField.itemSchema || []));
                onUpdate("refresh");
              } else if (action === "remove") {
                item[subField.key].splice(a, 1);
                onUpdate("refresh");
              } else if (action === "move") {
                var moved = item[subField.key].splice(a, 1)[0];
                item[subField.key].splice(b, 0, moved);
                onUpdate("refresh");
              } else if (action === "set") {
                if (!item[subField.key]) item[subField.key] = [];
                if (!item[subField.key][a]) item[subField.key][a] = {};
                item[subField.key][a][b] = arguments[3];
                onUpdate("refresh");
              } else if (action === "refresh") {
                onUpdate("refresh");
              }
            }, { pathPrefix: childPath });
            itemEl.appendChild(nestedEl);
          } else if (subField.type === "object") {
            var objEl = createObjectField(
              subField,
              item[subField.key],
              function (key, val) {
                if (!item[subField.key]) item[subField.key] = {};
                item[subField.key][key] = val;
                onUpdate("refresh");
              },
              { pathPrefix: childPath }
            );
            itemEl.appendChild(objEl);
          } else {
            var fieldEl = createFieldInput(
              subField,
              item[subField.key],
              function (v) {
                onUpdate("set", idx, subField.key, v);
              },
              { focusKey: childPath }
            );
            itemEl.appendChild(fieldEl);
          }
        });

        itemsContainer.appendChild(itemEl);
      });
    }

    renderItems();

    var addBtn = document.createElement("button");
    addBtn.className = "add-array-item-btn";
    addBtn.textContent = "+ Add Item";
    addBtn.addEventListener("click", function () {
      onUpdate("add");
    });
    wrapper.appendChild(addBtn);

    return wrapper;
  }

  // ── Block Form ──────────────────────────────────────────────────────────────

  function renderBlockForm(block, schema, onFieldChange, options) {
    var renderOptions = options || {};
    var container = document.createElement("div");

    (schema.fields || []).forEach(function (fieldDef) {
      var fieldPath = renderOptions.pathPrefix
        ? renderOptions.pathPrefix + "." + fieldDef.key
        : fieldDef.key;
      if (fieldDef.type === "array") {
        var arrData = block[fieldDef.key] || [];
        var el = createArrayField(fieldDef, arrData, function (action, a, b, c) {
          if (action === "add") {
            if (!block[fieldDef.key]) block[fieldDef.key] = [];
            var newItem = createDefaultObject(fieldDef.itemSchema || []);
            block[fieldDef.key].push(newItem);
            onFieldChange();
          } else if (action === "remove") {
            block[fieldDef.key].splice(a, 1);
            onFieldChange();
          } else if (action === "move") {
            var moved = block[fieldDef.key].splice(a, 1)[0];
            block[fieldDef.key].splice(b, 0, moved);
            onFieldChange();
          } else if (action === "set") {
            block[fieldDef.key][a][b] = c;
            onFieldChange();
          } else if (action === "refresh") {
            onFieldChange();
          }
        }, { pathPrefix: fieldPath });
        container.appendChild(el);
      } else if (fieldDef.type === "object") {
        var objEl = createObjectField(
          fieldDef,
          block[fieldDef.key],
          function (key, val) {
            if (!block[fieldDef.key]) block[fieldDef.key] = {};
            block[fieldDef.key][key] = val;
            onFieldChange();
          },
          { pathPrefix: fieldPath }
        );
        container.appendChild(objEl);
      } else {
        var fieldEl = createFieldInput(
          fieldDef,
          block[fieldDef.key],
          function (v) {
            block[fieldDef.key] = v;
            onFieldChange();
          },
          { focusKey: fieldPath }
        );
        container.appendChild(fieldEl);
      }
    });

    return container;
  }

  // ── Meta Editor ─────────────────────────────────────────────────────────────

  var META_FIELDS = [
    { key: "title", type: "text", label: "Title" },
    { key: "subtitle", type: "text", label: "Subtitle" },
    { key: "series", type: "text", label: "Series" },
    { key: "tag", type: "text", label: "Tag" },
    { key: "theme", type: "text", label: "Theme", optional: true, placeholder: "warm | 8bit" },
    { key: "author", type: "text", label: "Author" },
    { key: "author_handle", type: "text", label: "Author Handle" },
    { key: "source_tip", type: "number", label: "Source Tip", optional: true },
    { key: "source_file", type: "text", label: "Source File", optional: true },
    { key: "created_at", type: "text", label: "Created At", optional: true },
    { key: "cover_illustration", type: "text", label: "Cover Illustration", optional: true },
  ];

  function renderMetaEditor(container, state) {
    container.innerHTML = "";

    var toggle = document.createElement("button");
    toggle.className = "section-toggle";
    toggle.innerHTML = '<span class="arrow">\u25b6</span> Meta';
    var content = document.createElement("div");
    content.className = "section-content";

    toggle.addEventListener("click", function () {
      toggle.classList.toggle("open");
      content.classList.toggle("open");
    });

    var meta = state.getMeta();
    META_FIELDS.forEach(function (fieldDef) {
      var el = createFieldInput(
        fieldDef,
        meta[fieldDef.key],
        function (v) {
          state.setMeta(fieldDef.key, v);
        },
        { focusKey: "meta." + fieldDef.key }
      );
      content.appendChild(el);
    });

    container.appendChild(toggle);
    container.appendChild(content);
  }

  // ── Slide List ──────────────────────────────────────────────────────────────

  function renderSlideList(container, state, callbacks) {
    destroySortableInstance(container, "__slideSortable");
    container.innerHTML = "";
    var slides = state.getSlides();
    var slideCards = document.createElement("div");
    slideCards.className = "slide-card-list";

    slides.forEach(function (slide, idx) {
      var card = document.createElement("div");
      card.className = "slide-card" + (idx === state.selectedSlideIndex ? " active" : "");
      card.dataset.slideIndex = String(idx);

      var dragHandle = createDragHandle("slide-card-drag-handle", "Drag to reorder slide");
      card.appendChild(dragHandle);

      var num = document.createElement("span");
      num.className = "slide-card-num";
      num.textContent = slide.slide || (idx + 1);
      card.appendChild(num);

      var info = document.createElement("div");
      info.className = "slide-card-info";
      var layout = document.createElement("div");
      layout.className = "slide-card-layout";
      layout.textContent = slide.layout || "content";
      info.appendChild(layout);
      var title = document.createElement("div");
      title.className = "slide-card-title";
      title.textContent = (slide.title || "").replace(/\\n/g, " ").substring(0, 40);
      info.appendChild(title);
      card.appendChild(info);

      var actions = document.createElement("div");
      actions.className = "slide-card-actions";

      var renderBtn = document.createElement("button");
      renderBtn.className = "render-slide-btn";
      renderBtn.textContent = "\u25b6";
      renderBtn.title = "Render this slide";
      renderBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        callbacks.onRenderSlide(idx, slide.slide || (idx + 1));
      });
      actions.appendChild(renderBtn);

      if (idx > 0) {
        var upBtn = document.createElement("button");
        upBtn.textContent = "\u2191";
        upBtn.title = "Move up";
        upBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          state.moveSlide(idx, idx - 1);
        });
        actions.appendChild(upBtn);
      }

      if (idx < slides.length - 1) {
        var downBtn = document.createElement("button");
        downBtn.textContent = "\u2193";
        downBtn.title = "Move down";
        downBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          state.moveSlide(idx, idx + 1);
        });
        actions.appendChild(downBtn);
      }

      var delBtn = document.createElement("button");
      delBtn.className = "delete-slide-btn";
      delBtn.textContent = "\u00d7";
      delBtn.title = "Delete slide";
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (confirm("Delete slide " + (slide.slide || idx + 1) + "?")) {
          state.removeSlide(idx);
        }
      });
      actions.appendChild(delBtn);

      card.appendChild(actions);

      card.addEventListener("click", function () {
        state.selectSlide(idx);
        if (callbacks && typeof callbacks.onSelectSlide === "function") {
          callbacks.onSelectSlide(idx, slide.slide || (idx + 1));
        }
      });

      slideCards.appendChild(card);
    });

    container.appendChild(slideCards);

    // Add Slide button
    var addArea = document.createElement("div");
    addArea.className = "add-block-area";
    var addSelect = document.createElement("select");
    addSelect.className = "add-block-select";
    LAYOUT_OPTIONS.forEach(function (lo) {
      var o = document.createElement("option");
      o.value = lo;
      o.textContent = lo;
      addSelect.appendChild(o);
    });
    addArea.appendChild(addSelect);

    var addBtn = document.createElement("button");
    addBtn.className = "add-block-btn";
    addBtn.textContent = "+ Slide";
    addBtn.addEventListener("click", function () {
      state.addSlide(addSelect.value, state.selectedSlideIndex);
    });
    addArea.appendChild(addBtn);
    container.appendChild(addArea);

    container.__slideSortable = createSlideSortable(slideCards, state, callbacks);
  }

  // ── Active Slide Form ───────────────────────────────────────────────────────

  function renderSlideForm(container, state, callbacks) {
    destroySortableInstance(container, "__blockSortable");
    container.innerHTML = "";
    var idx = state.selectedSlideIndex;
    var slide = state.getSlide(idx);
    if (!slide) return;

    var form = document.createElement("div");
    form.className = "slide-form";

    var header = document.createElement("div");
    header.className = "slide-form-header";
    var h3 = document.createElement("h3");
    h3.textContent = "Slide " + (slide.slide || idx + 1);
    header.appendChild(h3);

    var headerActions = document.createElement("div");
    headerActions.className = "slide-form-actions";
    [
      { action: "rewrite", label: "Rewrite" },
      { action: "shorten", label: "Shorten" },
      { action: "punch-up", label: "Punch Up" },
      { action: "suggest-layout", label: "Suggest Layout" },
    ].forEach(function (entry) {
      headerActions.appendChild(createSlideAiActionButton(entry.action, entry.label, callbacks, {
        index: idx,
        slide: slide,
      }));
    });
    header.appendChild(headerActions);
    form.appendChild(header);

    var body = document.createElement("div");
    body.className = "slide-form-body";

    // Layout dropdown
    var layoutField = createFieldInput(
      { key: "layout", type: "select", label: "Layout", options: LAYOUT_OPTIONS },
      slide.layout || "content",
      function (v) { state.updateSlideField(idx, "layout", v); },
      { focusKey: "slide." + idx + ".layout" }
    );
    body.appendChild(layoutField);

    // Title
    var titleField = createFieldInput(
      { key: "title", type: "text", label: "Title" },
      slide.title || "",
      function (v) { state.updateSlideField(idx, "title", v); },
      { focusKey: "slide." + idx + ".title" }
    );
    body.appendChild(titleField);

    // Subtitle
    var subtitleField = createFieldInput(
      { key: "subtitle", type: "textarea", label: "Subtitle" },
      slide.subtitle || "",
      function (v) { state.updateSlideField(idx, "subtitle", v); },
      { focusKey: "slide." + idx + ".subtitle" }
    );
    body.appendChild(subtitleField);

    // Subtitle icon
    var subtitleIconField = createFieldInput(
      { key: "subtitle_icon", type: "text", label: "Subtitle Icon", optional: true },
      slide.subtitle_icon || "",
      function (v) { state.updateSlideField(idx, "subtitle_icon", v); },
      { focusKey: "slide." + idx + ".subtitle_icon" }
    );
    body.appendChild(subtitleIconField);

    // Blocks
    var blocksSection = document.createElement("div");
    blocksSection.className = "blocks-section";

    var blocksLabel = document.createElement("label");
    blocksLabel.textContent = "BLOCKS";
    blocksLabel.style.cssText = "font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;display:block;";
    blocksSection.appendChild(blocksLabel);

    var blocks = slide.blocks || [];
    var blockList = document.createElement("div");
    blockList.className = "block-list";
    blocks.forEach(function (block, bIdx) {
      var blockType = block.type || "unknown";
      var schema = BLOCK_SCHEMAS[blockType];

      var blockItem = document.createElement("div");
      blockItem.className = "block-item";
      blockItem.dataset.blockIndex = String(bIdx);

      // Block header
      var blockHeader = document.createElement("div");
      blockHeader.className = "block-header";

      var dragHandle = createDragHandle("block-drag-handle", "Drag to reorder block");
      blockHeader.appendChild(dragHandle);

      var badge = document.createElement("span");
      badge.className = "block-type-badge";
      badge.textContent = blockType;
      blockHeader.appendChild(badge);

      var blockIdx = document.createElement("span");
      blockIdx.className = "block-index";
      blockIdx.textContent = "#" + (bIdx + 1);
      blockHeader.appendChild(blockIdx);

      var blockActions = document.createElement("div");
      blockActions.className = "block-actions";

      if (bIdx > 0) {
        var upBtn = document.createElement("button");
        upBtn.textContent = "\u2191";
        upBtn.title = "Move up";
        upBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          state.moveBlock(idx, bIdx, bIdx - 1);
        });
        blockActions.appendChild(upBtn);
      }

      if (bIdx < blocks.length - 1) {
        var downBtn = document.createElement("button");
        downBtn.textContent = "\u2193";
        downBtn.title = "Move down";
        downBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          state.moveBlock(idx, bIdx, bIdx + 1);
        });
        blockActions.appendChild(downBtn);
      }

      var delBtn = document.createElement("button");
      delBtn.className = "delete-block-btn";
      delBtn.textContent = "\u00d7";
      delBtn.title = "Delete block";
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (confirm("Delete " + blockType + " block?")) {
          state.removeBlock(idx, bIdx);
        }
      });
      blockActions.appendChild(delBtn);

      blockHeader.appendChild(blockActions);
      blockItem.appendChild(blockHeader);

      // Block body
      var blockBody = document.createElement("div");
      blockBody.className = "block-body";

      if (schema) {
        var formEl = renderBlockForm(
          block,
          schema,
          function () {
            state._markDirty();
            state._emit();
          },
          { pathPrefix: "block." + idx + "." + bIdx }
        );
        blockBody.appendChild(formEl);
      } else {
        var note = document.createElement("div");
        note.style.cssText = "color:#666;font-size:12px;padding:8px;";
        note.textContent = "No schema for block type: " + blockType;
        blockBody.appendChild(note);
      }

      // Toggle collapse
      blockHeader.addEventListener("click", function () {
        blockBody.classList.toggle("collapsed");
      });

      blockItem.appendChild(blockBody);
      blockList.appendChild(blockItem);
    });
    blocksSection.appendChild(blockList);

    // Add block
    var addArea = document.createElement("div");
    addArea.className = "add-block-area";
    var addSelect = document.createElement("select");
    addSelect.className = "add-block-select";
    Object.keys(BLOCK_SCHEMAS).forEach(function (type) {
      var o = document.createElement("option");
      o.value = type;
      o.textContent = BLOCK_SCHEMAS[type].label || type;
      addSelect.appendChild(o);
    });
    addArea.appendChild(addSelect);

    var addBtn = document.createElement("button");
    addBtn.className = "add-block-btn";
    addBtn.textContent = "+ Block";
    addBtn.addEventListener("click", function () {
      state.addBlock(idx, addSelect.value);
    });
    addArea.appendChild(addBtn);
    blocksSection.appendChild(addArea);

    body.appendChild(blocksSection);
    form.appendChild(body);
    container.appendChild(form);
    container.__blockSortable = createBlockSortable(blockList, state, idx);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    renderMetaEditor: renderMetaEditor,
    renderSlideList: renderSlideList,
    renderSlideForm: renderSlideForm,
    escapeHtml: escapeHtml,
  };
})();
