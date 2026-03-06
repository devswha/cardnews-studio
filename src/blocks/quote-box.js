const { escapeHtml, nl2br, safeClassSuffix } = require("./_utils");

module.exports = function renderQuoteBox(block = {}) {
  const style = safeClassSuffix(block.style, "default");
  const contentHtml = nl2br(block.content || "");
  const author = block.author ? escapeHtml(block.author) : "";

  return `<div class="quote-box quote-box--${style}">
  <div class="quote-box__mark">\u201C</div>
  <blockquote class="quote-box__content">${contentHtml}</blockquote>
  ${author ? `<cite class="quote-box__author">\u2014 ${author}</cite>` : ""}
</div>`;
};
