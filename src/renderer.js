const fs = require("fs/promises");
const path = require("path");
const puppeteer = require("puppeteer");

class Renderer {
  constructor(options = {}) {
    this.width = options.width || 1080;
    this.height = options.height || 1350;
    this.deviceScaleFactor = options.deviceScaleFactor || 2;
    this.browser = null;
  }

  async init() {
    if (this.browser) {
      return;
    }

    this.browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  async close() {
    if (!this.browser) {
      return;
    }
    await this.browser.close();
    this.browser = null;
  }

  async waitForFonts(page) {
    try {
      await page.waitForFunction(
        () => {
          if (!document.fonts || !document.fonts.check) {
            return true;
          }
          const pretendardLoaded =
            document.fonts.check('16px Pretendard') || document.fonts.check('16px "Pretendard Variable"');
          const jetbrainsLoaded =
            document.fonts.check('16px "JetBrains Mono"') || document.fonts.check("16px JetBrains Mono");
          return pretendardLoaded && jetbrainsLoaded;
        },
        { timeout: 4000 }
      );
    } catch {
      console.warn("[warn] Font loading timed out — rendering with fallback fonts");
    }
  }

  async checkOverflow(page, slideNumber) {
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    if (scrollHeight > this.height) {
      console.warn(
        `[warn] Slide ${slideNumber} content overflows viewport by ${scrollHeight - this.height}px — content may be clipped`
      );
    }
  }

  async renderSlides(renderJobs, outputDir) {
    if (!Array.isArray(renderJobs) || renderJobs.length === 0) {
      return [];
    }

    await fs.mkdir(outputDir, { recursive: true });
    await this.init();

    const page = await this.browser.newPage();
    await page.setViewport({
      width: this.width,
      height: this.height,
      deviceScaleFactor: this.deviceScaleFactor,
    });

    const outputPaths = [];

    try {
      for (const job of renderJobs) {
        const fileName = `${String(job.slideNumber).padStart(2, "0")}.png`;
        const outputPath = path.join(outputDir, fileName);

        await page.setContent(job.html, { waitUntil: "domcontentloaded", timeout: 10000 });
        await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch((err) => {
          console.warn(`[warn] Network idle timeout on slide ${job.slideNumber}: ${err.message}`);
        });
        await this.waitForFonts(page);
        await this.checkOverflow(page, job.slideNumber);
        await page.screenshot({
          path: outputPath,
          type: "png",
        });

        outputPaths.push(outputPath);
      }
    } finally {
      await page.close();
    }

    return outputPaths;
  }
}

module.exports = Renderer;
