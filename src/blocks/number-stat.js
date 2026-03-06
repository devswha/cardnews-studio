const { escapeHtml, highlightWord } = require("./_utils");

module.exports = function renderNumberStat(block = {}) {
  const value = escapeHtml(block.value || "0");
  const labelHtml = block.highlight_word
    ? highlightWord(block.label || "", block.highlight_word, "highlight")
    : escapeHtml(block.label || "");

  return `<div class="number-stat">
  <div class="number-stat__value">${value}</div>
  <div class="number-stat__label">${labelHtml}</div>
</div>`;
};
