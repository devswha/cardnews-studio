const { escapeHtml, clampPercent } = require("./_utils");

module.exports = function renderProgressBar(block = {}) {
  const value = clampPercent(block.value);
  const label = escapeHtml(block.label || "");
  const displayText = escapeHtml(block.display_text || `${Math.round(value)}%`);
  const color = escapeHtml(block.color || "#D4845C");

  return `<div class="progress-bar-block">
  <div class="progress-bar-header">
    <span class="progress-bar-label">${label}</span>
    <span class="progress-bar-value">${displayText}</span>
  </div>
  <div class="progress-bar-track">
    <div class="progress-bar-fill" style="width:${value}%;background:${color};"></div>
  </div>
</div>`;
};
