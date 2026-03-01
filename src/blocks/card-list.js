const { escapeHtml, nl2br, highlightWord } = require("./_utils");

module.exports = function renderCardList(block = {}) {
  const items = Array.isArray(block.items) ? block.items : [];

  const itemHtml = items
    .map((item) => {
      const titleHtml = highlightWord(item && item.title, item && item.highlight_word, "highlight");
      const descriptionHtml = nl2br(item && item.description);
      const emoji = escapeHtml(item && item.emoji);

      return `<div class="card-item">
  <span class="card-icon">${emoji}</span>
  <div class="card-content">
    <h3 class="card-title">${titleHtml}</h3>
    <p class="card-description">${descriptionHtml}</p>
  </div>
</div>`;
    })
    .join("");

  return `<div class="card-list">${itemHtml}</div>`;
};
