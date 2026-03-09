const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { fetchArticle } = require("../src/url-fetcher");

function createLookup(address = "93.184.216.34", family = 4) {
  return async function lookup() {
    return [{ address, family }];
  };
}

function createResponse({ status = 200, body = "", headers = {} } = {}) {
  const normalizedHeaders = Object.create(null);
  Object.keys(headers).forEach((key) => {
    normalizedHeaders[key.toLowerCase()] = headers[key];
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return normalizedHeaders[String(name || "").toLowerCase()] || null;
      },
    },
    async text() {
      return body;
    },
  };
}

describe("url-fetcher", () => {
  it("extracts article title and content from fetched HTML", async () => {
    const calls = [];
    const article = await fetchArticle("https://example.com/story", {
      lookupImpl: createLookup("93.184.216.34"),
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return createResponse({
          body: [
            "<html><head>",
            '<title>Fallback title</title>',
            '<meta property="og:title" content="OG headline">',
            "</head><body>",
            "<article><p>First paragraph.</p><p>Second paragraph.</p></article>",
            "</body></html>",
          ].join(""),
        });
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://example.com/story");
    assert.equal(article.title, "OG headline");
    assert.match(article.content, /First paragraph\./);
    assert.match(article.content, /Second paragraph\./);
    assert.match(article.source, /example\.com/i);
  });

  it("rejects non-http protocols before making a request", async () => {
    await assert.rejects(
      async () =>
        fetchArticle("file:///etc/passwd", {
          fetchImpl: async () => {
            throw new Error("fetch should not be called");
          },
        }),
      /http|https|protocol/i
    );
  });

  it("rejects direct private IP targets", async () => {
    await assert.rejects(
      async () =>
        fetchArticle("https://127.0.0.1/internal", {
          fetchImpl: async () => {
            throw new Error("fetch should not be called");
          },
        }),
      /private|forbidden|ssrf|loopback|local/i
    );
  });

  it("rejects DNS resolutions that point to private IP addresses", async () => {
    await assert.rejects(
      async () =>
        fetchArticle("https://example.com/private", {
          lookupImpl: createLookup("10.0.0.8"),
          fetchImpl: async () => {
            throw new Error("fetch should not be called");
          },
        }),
      /private|forbidden|ssrf|loopback|local/i
    );
  });

  it("times out slow upstream requests", async () => {
    const pending = fetchArticle("https://example.com/slow", {
      lookupImpl: createLookup("93.184.216.34"),
      timeoutMs: 1,
      fetchImpl: async (url, options) =>
        new Promise((resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          });
        }),
    });

    await assert.rejects(async () => pending, /time(?:d)? out|timeout/i);
  });

  it("follows redirects and preserves the final source URL", async () => {
    const calls = [];

    const article = await fetchArticle("https://example.com/start", {
      lookupImpl: createLookup("93.184.216.34"),
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.endsWith("/start")) {
          return createResponse({
            status: 302,
            headers: {
              location: "/final",
            },
          });
        }

        return createResponse({
          body: "<main>Redirect target body</main>",
        });
      },
    });

    assert.deepEqual(calls, [
      "https://example.com/start",
      "https://example.com/final",
    ]);
    assert.equal(article.source, "https://example.com/final");
    assert.match(article.content, /Redirect target body/);
  });
});
