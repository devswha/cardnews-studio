const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const puppeteer = require("puppeteer");
const { createApp } = require("../server");

let server;
let baseUrl;
let browser;

before(async () => {
  server = http.createServer(createApp());
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
});

after(async () => {
  if (browser) {
    await browser.close();
  }

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

describe("editor e2e", () => {
  it("allows switching to another spec after the first one loads", async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 15000 });

    await page.click('[data-slug="topic-oh-my-codex"]');
    await page.waitForSelector('#previewImage:not(.hidden)');

    await page.click('[data-slug="topic-sdd"]');
    await page.waitForFunction(() => {
      const active = document.querySelector(".spec-item.active");
      const filename = document.getElementById("editorFilename");
      const img = document.getElementById("slideImg");
      return active &&
        active.dataset.slug === "topic-sdd" &&
        filename &&
        filename.textContent === "topic-sdd.yaml" &&
        img &&
        /\/output\/topic-sdd\/01\.png/.test(img.getAttribute("src") || "");
    });

    const state = await page.evaluate(() => ({
      activeSlug: document.querySelector(".spec-item.active")?.dataset.slug,
      filename: document.getElementById("editorFilename")?.textContent,
      previewSrc: document.getElementById("slideImg")?.getAttribute("src"),
    }));

    assert.equal(state.activeSlug, "topic-sdd");
    assert.equal(state.filename, "topic-sdd.yaml");
    assert.match(state.previewSrc, /\/output\/topic-sdd\/01\.png\?t=/);

    await page.close();
  });

  it("syncs the right preview when a different slide card is selected", async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 15000 });

    await page.click('[data-slug="topic-oh-my-codex"]');
    await page.waitForSelector('#previewImage:not(.hidden)');

    await page.click(".slide-card:nth-of-type(3)");
    await page.waitForFunction(() => {
      const active = document.querySelector(".slide-card.active .slide-card-num");
      const img = document.getElementById("slideImg");
      return active &&
        active.textContent.trim() === "3" &&
        img &&
        /\/output\/topic-oh-my-codex\/03\.png/.test(img.getAttribute("src") || "");
    });

    const previewSrc = await page.$eval("#slideImg", (img) => img.getAttribute("src"));
    assert.match(previewSrc, /\/output\/topic-oh-my-codex\/03\.png\?t=/);

    await page.close();
  });

  it("reorders slide cards through the drag-and-drop wiring", async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 15000 });

    await page.click('[data-slug="topic-oh-my-codex"]');
    await page.waitForSelector(".slide-card-drag-handle");

    const initialTitles = await page.$$eval(".slide-card .slide-card-title", (els) =>
      els.slice(0, 2).map((el) => el.textContent.trim())
    );
    assert.equal(initialTitles.length, 2);

    await page.evaluate(() => {
      const sortable = document.getElementById("slideList").__slideSortable;
      if (!sortable || !sortable.options || typeof sortable.options.onEnd !== "function") {
        throw new Error("Slide sortable wiring is unavailable.");
      }
      sortable.options.onEnd({ oldIndex: 0, newIndex: 1 });
    });

    await page.waitForFunction(
      (firstTitle, secondTitle) => {
        const titles = Array.from(document.querySelectorAll(".slide-card .slide-card-title"))
          .slice(0, 2)
          .map((el) => el.textContent.trim());
        const active = document.querySelector(".slide-card.active .slide-card-title");
        return titles[0] === secondTitle &&
          titles[1] === firstTitle &&
          active &&
          active.textContent.trim() === firstTitle;
      },
      {},
      initialTitles[0],
      initialTitles[1]
    );

    await page.close();
  });

  it("reorders blocks through the drag-and-drop wiring", async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 15000 });

    await page.click('[data-slug="topic-oh-my-codex"]');
    await page.waitForSelector(".slide-card:nth-of-type(5)");
    await page.click(".slide-card:nth-of-type(5)");
    await page.waitForSelector(".block-drag-handle");

    const initialTypes = await page.$$eval(".block-header .block-type-badge", (els) =>
      els.slice(0, 2).map((el) => el.textContent.trim())
    );
    assert.deepEqual(initialTypes, ["card-list", "terminal-block"]);

    await page.evaluate(() => {
      const sortable = document.getElementById("slideFormContainer").__blockSortable;
      if (!sortable || !sortable.options || typeof sortable.options.onEnd !== "function") {
        throw new Error("Block sortable wiring is unavailable.");
      }
      sortable.options.onEnd({ oldIndex: 0, newIndex: 1 });
    });

    await page.waitForFunction(() => {
      const types = Array.from(document.querySelectorAll(".block-header .block-type-badge"))
        .slice(0, 2)
        .map((el) => el.textContent.trim());
      return types[0] === "terminal-block" && types[1] === "card-list";
    });

    await page.close();
  });

  it("shows slide AI quick actions and disables layout suggestions on boundary slides", async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 15000 });

    await page.click('[data-slug="topic-oh-my-codex"]');
    await page.waitForSelector(".slide-ai-btn[data-action=\"rewrite\"]");

    const firstSlideState = await page.evaluate(() => ({
      rewriteExists: Boolean(document.querySelector('.slide-ai-btn[data-action="rewrite"]')),
      shortenExists: Boolean(document.querySelector('.slide-ai-btn[data-action="shorten"]')),
      punchExists: Boolean(document.querySelector('.slide-ai-btn[data-action="punch-up"]')),
      suggestDisabled: document.querySelector('.slide-ai-btn[data-action="suggest-layout"]')?.disabled || false,
    }));

    assert.equal(firstSlideState.rewriteExists, true);
    assert.equal(firstSlideState.shortenExists, true);
    assert.equal(firstSlideState.punchExists, true);
    assert.equal(firstSlideState.suggestDisabled, true);

    await page.click(".slide-card:nth-of-type(3)");
    await page.waitForFunction(() => {
      const button = document.querySelector('.slide-ai-btn[data-action="suggest-layout"]');
      return button && !button.disabled;
    });

    await page.close();
  });

  it("filters specs and auto-loads an existing preview", async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 15000 });

    await page.type("#specSearch", "oh-my-codex");
    await page.waitForFunction(() => document.querySelectorAll(".spec-item").length === 1);

    const slug = await page.$eval(".spec-item", (el) => el.dataset.slug);
    assert.equal(slug, "topic-oh-my-codex");

    await page.click(".spec-item");
    await page.waitForFunction(() => {
      const img = document.getElementById("slideImg");
      const preview = document.getElementById("previewImage");
      return preview && !preview.classList.contains("hidden") && img && /\/output\/topic-oh-my-codex\/01\.png/.test(img.getAttribute("src") || "");
    });

    const previewSrc = await page.$eval("#slideImg", (img) => img.getAttribute("src"));
    assert.match(previewSrc, /\/output\/topic-oh-my-codex\/01\.png\?t=/);

    await page.close();
  });

  it("blocks save on validation errors and shows validation feedback", async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 15000 });

    await page.click('[data-slug="topic-oh-my-codex"]');
    const titleSelector = '.slide-form .form-group:nth-of-type(2) input';
    await page.waitForSelector(titleSelector);

    await page.click(titleSelector, { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.click("#saveBtn");

    await page.waitForFunction(() => {
      const panel = document.getElementById("validationPanel");
      const toast = document.querySelector("#toastRegion .toast:last-child .toast__body");
      return panel && !panel.classList.contains("hidden") && toast;
    });

    const panelText = await page.$eval("#validationPanel", (el) => el.textContent);
    const toastText = await page.$eval("#toastRegion .toast:last-child .toast__body", (el) => el.textContent);

    assert.match(panelText, /title is required/i);
    assert.match(toastText, /validation issue/i);

    await page.close();
  });
});
