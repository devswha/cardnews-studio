const { escapeHtml, nl2br } = require("./_utils");

module.exports = function renderIconGrid(block = {}) {
  const columns = block.columns === 3 ? 3 : 2;
  const items = Array.isArray(block.items) ? block.items : [];

  const itemsHtml = items
    .map((item) => {
      const emoji = escapeHtml(item.emoji || "");
      const title = escapeHtml(item.title || "");
      const desc = item.description ? nl2br(item.description) : "";
      return `<div class="icon-grid__item">
    <div class="icon-grid__icon">${emoji}</div>
    <div class="icon-grid__title">${title}</div>
    ${desc ? `<div class="icon-grid__desc">${desc}</div>` : ""}
  </div>`;
    })
    .join("\n  ");

  return `<div class="icon-grid icon-grid--cols-${columns}">
  ${itemsHtml}
</div>`;
};
