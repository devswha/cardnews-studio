const { escapeHtml, clampPercent } = require("./_utils");

module.exports = function renderBarList(block = {}) {
  const items = Array.isArray(block.items) ? block.items : [];

  const itemHtml = items
    .map((item) => {
      const ratio = clampPercent(item && item.ratio);
      return `<div class="bar-list-item">
  <div class="bar-list-meta">
    <span class="bar-list-label">${escapeHtml(item && item.emoji)} ${escapeHtml(item && item.label)}</span>
    <span class="bar-list-ratio">${Math.round(ratio)}%</span>
  </div>
  <div class="bar-list-track">
    <div class="bar-list-fill" style="width:${ratio}%;"></div>
  </div>
</div>`;
    })
    .join("");

  return `<div class="bar-list">${itemHtml}</div>`;
};
