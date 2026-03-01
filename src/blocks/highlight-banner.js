const { escapeHtml } = require("./_utils");

function wrapToken(html, token, startTag, endTag) {
  const safeToken = escapeHtml(token);
  if (!safeToken || !html.includes(safeToken)) {
    return html;
  }
  return html.split(safeToken).join(`${startTag}${safeToken}${endTag}`);
}

module.exports = function renderHighlightBanner(block = {}) {
  const content = String(block.content || "");
  const boldPart = String(block.bold_part || "");
  const inlineCode = String(block.inline_code || "");

  let contentHtml = escapeHtml(content);
  contentHtml = wrapToken(contentHtml, boldPart, "<strong>", "</strong>");
  contentHtml = wrapToken(contentHtml, inlineCode, "<code>", "</code>");

  if (inlineCode && !content.includes(inlineCode)) {
    contentHtml = `${contentHtml} <code>${escapeHtml(inlineCode)}</code>`;
  }

  contentHtml = contentHtml.replace(/\r?\n/g, "<br>");

  return `<div class="highlight-banner">
  <p class="highlight-banner-content">${contentHtml}</p>
</div>`;
};
