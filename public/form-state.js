// form-state.js — Spec state management for the visual editor
// Browser script loaded via <script> tag
// Depends on: block-schemas.js (BLOCK_SCHEMAS global), schema-defaults.js (SchemaDefaults global)

function setByPath(obj, path, value) {
  const keys = path.split(".");
  let target = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = isNaN(keys[i]) ? keys[i] : Number(keys[i]);
    if (target[key] === undefined) target[key] = {};
    target = target[key];
  }
  const lastKey = isNaN(keys[keys.length - 1])
    ? keys[keys.length - 1]
    : Number(keys[keys.length - 1]);
  target[lastKey] = value;
}

const FormState = (function () {
  function State() {
    this.slug = null;
    this.meta = {};
    this.slides = [];
    this.dirty = false;
    this.selectedSlideIndex = 0;
    this._listeners = [];
  }

  // ── Event system ──────────────────────────────────────────────────────────

  State.prototype.onChange = function (callback) {
    this._listeners.push(callback);
  };

  State.prototype._emit = function () {
    const self = this;
    this._listeners.forEach(function (fn) {
      fn(self);
    });
  };

  State.prototype._markDirty = function () {
    this.dirty = true;
  };

  State.prototype.isDirty = function () {
    return this.dirty;
  };

  State.prototype.markClean = function () {
    this.dirty = false;
  };

  // ── Serialization ─────────────────────────────────────────────────────────

  State.prototype.toJSON = function () {
    return { meta: this.meta, slides: this.slides };
  };

  // ── Network ───────────────────────────────────────────────────────────────

  State.prototype.loadSpec = function (slug) {
    const self = this;
    return fetch("/api/specs/" + slug + "/json")
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            throw new Error(data.error || ("Failed to load spec: " + res.status));
          });
        }
        return res.json();
      })
      .then(function (data) {
        self.slug = slug;
        self.meta = data.meta || {};
        self.slides = data.slides || [];
        self.dirty = false;
        self.selectedSlideIndex = 0;
        self._emit();
      });
  };

  State.prototype.createSpec = function (slug, initialSpec) {
    const self = this;
    const payload = { slug: slug };
    if (initialSpec !== undefined) {
      payload.spec = initialSpec;
    }

    return fetch("/api/specs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            throw new Error(data.error || ("Failed to create spec: " + res.status));
          });
        }
        return res.json();
      })
      .then(function (data) {
        return self.loadSpec(data.slug || slug).then(function () {
          return data;
        });
      });
  };

  State.prototype.saveSpec = function () {
    const self = this;
    return fetch("/api/specs/" + this.slug, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.toJSON()),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            throw new Error(data.error || ("Failed to save spec: " + res.status));
          });
        }
        return res.json();
      })
      .then(function () {
        self.markClean();
        self._emit();
      });
  };

  State.prototype.deleteSpec = function (slug) {
    const self = this;
    const targetSlug = slug || this.slug;

    if (!targetSlug) {
      return Promise.reject(new Error("No spec selected"));
    }

    return fetch("/api/specs/" + targetSlug, {
      method: "DELETE",
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            throw new Error(data.error || ("Failed to delete spec: " + res.status));
          });
        }
        return res.json();
      })
      .then(function (data) {
        if (self.slug === targetSlug) {
          self.slug = null;
          self.meta = {};
          self.slides = [];
          self.dirty = false;
          self.selectedSlideIndex = 0;
        }
        self._emit();
        return data;
      });
  };

  // ── Meta methods ──────────────────────────────────────────────────────────

  State.prototype.getMeta = function () {
    return this.meta;
  };

  State.prototype.setMeta = function (field, value) {
    this.meta[field] = value;
    this._markDirty();
    this._emit();
  };

  // ── Slide methods ─────────────────────────────────────────────────────────

  State.prototype.getSlides = function () {
    return this.slides;
  };

  State.prototype.getSlide = function (index) {
    return this.slides[index];
  };

  State.prototype.selectSlide = function (index) {
    this.selectedSlideIndex = index;
    this._emit();
  };

  State.prototype._renumberSlides = function () {
    const total = this.slides.length;
    this.slides.forEach(function (slide, i) {
      slide.slide = i + 1;
    });
    if (this.meta) {
      this.meta.total_slides = total;
    }
  };

  State.prototype.addSlide = function (layout, afterIndex) {
    const insertAt =
      afterIndex === undefined ? this.slides.length : afterIndex + 1;
    const newSlide = {
      slide: insertAt + 1,
      layout: layout || "content",
      title: "",
      subtitle: "",
      blocks: [],
    };
    this.slides.splice(insertAt, 0, newSlide);
    this._renumberSlides();
    this.selectedSlideIndex = insertAt;
    this._markDirty();
    this._emit();
  };

  State.prototype.removeSlide = function (index) {
    if (this.slides.length <= 1) return;
    this.slides.splice(index, 1);
    this._renumberSlides();
    this.selectedSlideIndex = Math.min(
      this.selectedSlideIndex,
      this.slides.length - 1
    );
    this._markDirty();
    this._emit();
  };

  State.prototype.moveSlide = function (fromIndex, toIndex) {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= this.slides.length ||
      toIndex >= this.slides.length
    ) {
      return;
    }
    const slide = this.slides.splice(fromIndex, 1)[0];
    this.slides.splice(toIndex, 0, slide);
    this._renumberSlides();
    this.selectedSlideIndex = toIndex;
    this._markDirty();
    this._emit();
  };

  State.prototype.updateSlideField = function (index, field, value) {
    if (!this.slides[index]) return;
    this.slides[index][field] = value;
    this._markDirty();
    this._emit();
  };

  State.prototype.replaceSlide = function (index, nextSlide) {
    if (!this.slides[index] || !nextSlide || typeof nextSlide !== "object") {
      return;
    }

    const current = this.slides[index];
    this.slides[index] = {
      ...nextSlide,
      slide: current.slide || index + 1,
      blocks: Array.isArray(nextSlide.blocks) ? nextSlide.blocks : [],
    };
    this._markDirty();
    this._emit();
  };

  // ── Block methods ─────────────────────────────────────────────────────────

  State.prototype.getBlocks = function (slideIndex) {
    const slide = this.slides[slideIndex];
    return slide ? slide.blocks || [] : [];
  };

  State.prototype.getBlock = function (slideIndex, blockIndex) {
    const blocks = this.getBlocks(slideIndex);
    return blocks[blockIndex];
  };

  State.prototype.addBlock = function (slideIndex, blockType) {
    const slide = this.slides[slideIndex];
    if (!slide) return;
    if (!slide.blocks) slide.blocks = [];
    const schema = BLOCK_SCHEMAS[blockType] || {};
    const newBlock =
      typeof SchemaDefaults !== "undefined" && SchemaDefaults.createDefaultBlock
        ? SchemaDefaults.createDefaultBlock(blockType, schema)
        : { type: blockType };
    slide.blocks.push(newBlock);
    this._markDirty();
    this._emit();
  };

  State.prototype.removeBlock = function (slideIndex, blockIndex) {
    const slide = this.slides[slideIndex];
    if (!slide || !slide.blocks) return;
    slide.blocks.splice(blockIndex, 1);
    this._markDirty();
    this._emit();
  };

  State.prototype.moveBlock = function (slideIndex, fromIndex, toIndex) {
    const slide = this.slides[slideIndex];
    if (!slide || !slide.blocks) return;
    const blocks = slide.blocks;
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= blocks.length ||
      toIndex >= blocks.length
    ) {
      return;
    }
    const block = blocks.splice(fromIndex, 1)[0];
    blocks.splice(toIndex, 0, block);
    this._markDirty();
    this._emit();
  };

  State.prototype.updateBlockField = function (
    slideIndex,
    blockIndex,
    path,
    value
  ) {
    const block = this.getBlock(slideIndex, blockIndex);
    if (!block) return;
    setByPath(block, path, value);
    this._markDirty();
    this._emit();
  };

  return {
    create: function () {
      return new State();
    },
  };
})();
