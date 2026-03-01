const { escapeHtml, nl2br } = require("./_utils");

function backgroundStyle(color) {
  if (!color) {
    return "";
  }
  return ` style="background:${escapeHtml(color)};"`;
}

function renderSide(kind, data = {}) {
  const iconHtml = data.icon_url
    ? `<img class="before-after-icon" src="${escapeHtml(data.icon_url)}" alt="${escapeHtml(data.title || '')}" />`
    : `<div class="before-after-emoji">${escapeHtml(data.emoji)}</div>`;
  return `<div class="before-after-card before-after-card--${kind}"${backgroundStyle(data.bg_color)}>
  ${iconHtml}
  <h3 class="before-after-title">${escapeHtml(data.title)}</h3>
  <p class="before-after-description">${nl2br(data.description)}</p>
</div>`;
}

module.exports = function renderBeforeAfter(block = {}) {
  return `<div class="before-after">
  ${renderSide("before", block.before)}
  ${renderSide("after", block.after)}
</div>`;
};
