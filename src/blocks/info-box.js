const { escapeHtml, nl2br, highlightWord } = require("./_utils");

module.exports = function renderInfoBox(block = {}) {
  const icon = escapeHtml(block.icon || "ℹ️");
  const titleHtml = highlightWord(block.title, block.highlight_word, "highlight");
  const contentHtml = nl2br(block.content);

  return `<div class="info-box">
  <div class="info-box-header">
    <span class="info-box-icon">${icon}</span>
    <h3 class="info-box-title">${titleHtml}</h3>
  </div>
  <p class="info-box-content">${contentHtml}</p>
</div>`;
};
