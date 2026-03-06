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

describe("editor focus preservation", () => {
  it("keeps typing focus in the same field across rerenders", async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 15000 });
    await page.click('[data-slug="topic-oh-my-codex"]');
    await page.waitForSelector('.slide-form .form-group:nth-of-type(2) input');

    const selector = '.slide-form .form-group:nth-of-type(2) input';
    const originalValue = await page.$eval(selector, (input) => input.value);

    await page.click(selector);
    await page.keyboard.type("ABC");

    const result = await page.$eval(selector, (input) => ({
      value: input.value,
      focusKey: input.dataset.focusKey,
      activeFocusKey: document.activeElement && document.activeElement.dataset
        ? document.activeElement.dataset.focusKey || null
        : null,
    }));

    assert.equal(result.value, originalValue + "ABC");
    assert.equal(result.activeFocusKey, result.focusKey);

    await page.close();
  });
});
