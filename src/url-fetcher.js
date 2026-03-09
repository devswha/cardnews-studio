const dns = require("dns/promises");
const net = require("net");

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_CONTENT_CHARS = 20000;
const MAX_REDIRECTS = 5;
const DEFAULT_HEADERS = {
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
  "user-agent": "cardnews-studio/0.1 (+https://local.cardnews-studio)",
};

const HTML_ENTITY_MAP = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function createError(message, code, extra) {
  const error = new Error(message);
  error.code = code;
  if (extra && typeof extra === "object") {
    Object.assign(error, extra);
  }
  return error;
}

function normalizeUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw createError("URL is required.", "ERR_URL_REQUIRED");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw createError("Invalid URL. Use a full http:// or https:// URL.", "ERR_URL_INVALID");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw createError("Only http:// and https:// URLs are supported.", "ERR_URL_PROTOCOL");
  }

  return parsed;
}

function isBlockedIpv4(address) {
  const octets = address.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isBlockedIpv6(address) {
  const normalized = String(address || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized === "::1" || normalized === "::") {
    return true;
  }

  const condensed = normalized.replace(/^0+/, "");
  if (condensed.startsWith("fc") || condensed.startsWith("fd")) {
    return true;
  }

  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true;
  }

  return false;
}

function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    return isBlockedIpv4(address);
  }
  if (family === 6) {
    return isBlockedIpv6(address);
  }
  return false;
}

async function assertExternalAddress(url, options) {
  const safeOptions = options && typeof options === "object" ? options : {};
  const lookup = safeOptions.lookupImpl || safeOptions.lookup || dns.lookup;
  const hostname = url.hostname;

  let results;
  if (net.isIP(hostname)) {
    results = [{ address: hostname, family: net.isIP(hostname) }];
  } else {
    try {
      results = await lookup(hostname, { all: true, verbatim: true });
    } catch (error) {
      throw createError(`Failed to resolve host: ${hostname}.`, "ERR_URL_RESOLVE", {
        cause: error,
        hostname,
      });
    }
  }

  if (!Array.isArray(results) || !results.length) {
    throw createError(`Could not resolve host: ${hostname}.`, "ERR_URL_RESOLVE", { hostname });
  }

  const blocked = results.find((entry) => entry && isBlockedAddress(entry.address));
  if (blocked) {
    throw createError(
      "Access to private or local network resources is not allowed.",
      "ERR_URL_PRIVATE_IP",
      { hostname, address: blocked.address }
    );
  }

  return results;
}

function parseAttributes(tagSource) {
  const attributes = {};
  const source = String(tagSource || "").replace(/^<[^\s>]+\s*/i, "").replace(/\/?\s*>$/, "");
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;

  while ((match = pattern.exec(source))) {
    const key = String(match[1] || "").toLowerCase();
    if (!key) {
      continue;
    }
    attributes[key] = match[2] || match[3] || match[4] || "";
  }

  return attributes;
}

function extractMetaMap(html) {
  const metaMap = new Map();
  const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];

  tags.forEach((tag) => {
    const attributes = parseAttributes(tag);
    const keys = [attributes.property, attributes.name, attributes["http-equiv"]]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    const content = String(attributes.content || "").trim();
    if (!content) {
      return;
    }
    keys.forEach((key) => {
      if (!metaMap.has(key)) {
        metaMap.set(key, content);
      }
    });
  });

  return metaMap;
}

function decodeHtmlEntities(text) {
  return String(text || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity || "").toLowerCase();
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return Object.prototype.hasOwnProperty.call(HTML_ENTITY_MAP, normalized)
      ? HTML_ENTITY_MAP[normalized]
      : match;
  });
}

function cleanupHtmlFragment(html) {
  return String(html || "")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi, " ");
}

function extractTagInnerHtml(html, tagName) {
  const match = String(html || "").match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match && match[1] ? match[1] : "";
}

function htmlToText(html) {
  const cleaned = cleanupHtmlFragment(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|section|article|main|header|footer|aside|nav|ul|ol|li|h1|h2|h3|h4|h5|h6|blockquote|pre|table|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeHtmlEntities(cleaned)
    .replace(/\r/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function uniqueParagraphs(texts) {
  const seen = new Set();
  const output = [];

  texts.forEach((text) => {
    String(text || "")
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const key = part.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          output.push(part);
        }
      });
  });

  return output;
}

function truncateText(text, maxChars) {
  if (text.length <= maxChars) {
    return text;
  }

  const slice = text.slice(0, maxChars);
  const lastBreak = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf(" "));
  const cutoff = lastBreak > Math.floor(maxChars * 0.6) ? lastBreak : maxChars;
  return slice.slice(0, cutoff).trimEnd() + "…";
}

function extractArticleFromHtml(html, sourceUrl, options) {
  const safeOptions = options && typeof options === "object" ? options : {};
  const maxChars = Number.isFinite(safeOptions.maxContentChars)
    ? safeOptions.maxContentChars
    : DEFAULT_MAX_CONTENT_CHARS;
  const metaMap = extractMetaMap(html);
  const titleTag = extractTagInnerHtml(html, "title");
  const articleHtml = extractTagInnerHtml(html, "article");
  const mainHtml = extractTagInnerHtml(html, "main");
  const bodyHtml = extractTagInnerHtml(html, "body");

  const title = decodeHtmlEntities(
    metaMap.get("og:title")
    || metaMap.get("twitter:title")
    || titleTag
    || "Untitled article"
  ).trim();

  const description = decodeHtmlEntities(
    metaMap.get("og:description")
    || metaMap.get("description")
    || metaMap.get("twitter:description")
    || ""
  ).trim();

  const coreHtml = articleHtml || mainHtml || bodyHtml || html;
  const bodyText = htmlToText(coreHtml);
  const paragraphs = uniqueParagraphs([description, bodyText]);
  const content = truncateText(paragraphs.join("\n\n").trim() || title, maxChars);

  return {
    title,
    content,
    source: String(sourceUrl || "").trim(),
  };
}

async function fetchWithRedirects(initialUrl, options) {
  const safeOptions = options && typeof options === "object" ? options : {};
  const fetchImpl = safeOptions.fetchImpl || global.fetch;
  const timeoutMs = Number.isFinite(safeOptions.timeoutMs) ? safeOptions.timeoutMs : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    let currentUrl = normalizeUrl(initialUrl);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await assertExternalAddress(currentUrl, safeOptions);
      const requestUrl = currentUrl.toString();

      let response;
      try {
        response = await fetchImpl(requestUrl, {
          method: "GET",
          headers: DEFAULT_HEADERS,
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (error) {
        if (error && error.name === "AbortError") {
          throw createError(
            `Fetching the URL timed out after ${Math.round(timeoutMs / 1000)}s.`,
            "ERR_FETCH_TIMEOUT",
            { cause: error }
          );
        }
        throw createError(`Failed to fetch URL: ${error.message}`, "ERR_FETCH_FAILED", { cause: error });
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw createError("Upstream redirect did not include a location.", "ERR_FETCH_FAILED");
        }
        if (hop === MAX_REDIRECTS) {
          throw createError("Too many redirects while fetching the URL.", "ERR_FETCH_REDIRECTS");
        }
        currentUrl = new URL(location, requestUrl);
        continue;
      }

      if (!response.ok) {
        throw createError(
          `Failed to fetch URL: upstream responded with ${response.status}.`,
          "ERR_FETCH_FAILED",
          { status: response.status }
        );
      }

      return {
        finalUrl: requestUrl,
        html: await response.text(),
      };
    }

    throw createError("Too many redirects while fetching the URL.", "ERR_FETCH_REDIRECTS");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchArticle(rawUrl, options) {
  const safeOptions = options && typeof options === "object" ? options : {};
  const { finalUrl, html } = await fetchWithRedirects(rawUrl, safeOptions);
  return extractArticleFromHtml(html, finalUrl, safeOptions);
}

module.exports = {
  DEFAULT_MAX_CONTENT_CHARS,
  DEFAULT_TIMEOUT_MS,
  MAX_REDIRECTS,
  fetchArticle,
  _private: {
    assertExternalAddress,
    cleanupHtmlFragment,
    decodeHtmlEntities,
    extractArticleFromHtml,
    extractMetaMap,
    fetchWithRedirects,
    htmlToText,
    isBlockedAddress,
    isBlockedIpv4,
    isBlockedIpv6,
    normalizeUrl,
    parseAttributes,
    truncateText,
    uniqueParagraphs,
  },
};
