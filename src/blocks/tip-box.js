const { escapeHtml, highlightWord } = require("./_utils");

module.exports = function renderTipBox(block = {}) {
  const icon = escapeHtml(block.icon || "💡");
  const label = escapeHtml(block.label || "Tip");
  const contentHtml = highlightWord(block.content, block.highlight_word, "highlight").replace(/\r?\n/g, "<br>");

  return `<div class="tip-box">
  <div class="tip-box-header">
    <span class="tip-box-icon">${icon}</span>
    <span class="tip-box-label">${label}</span>
  </div>
  <p class="tip-box-content">${contentHtml}</p>
</div>`;
};
