const { escapeHtml, nl2br, highlightWord } = require("./_utils");

module.exports = function renderStepList(block = {}) {
  const items = Array.isArray(block.items) ? block.items : [];

  const itemHtml = items
    .map((item, index) => {
      const stepNumber = Number.isFinite(Number(item && item.step)) ? Number(item.step) : index + 1;
      const titleHtml = highlightWord(item && item.title, item && item.highlight_word, "highlight");
      const descriptionHtml = nl2br(item && item.description);
      const codeHtml = item && item.code ? `<code class="step-code">${escapeHtml(item.code)}</code>` : "";

      return `<li class="step-item">
  <div class="step-index">${escapeHtml(stepNumber)}</div>
  <div class="step-content">
    <div class="step-title-row">
      <span class="step-emoji">${escapeHtml(item && item.emoji)}</span>
      <h3 class="step-title">${titleHtml}</h3>
    </div>
    <p class="step-description">${descriptionHtml}</p>
    ${codeHtml}
  </div>
</li>`;
    })
    .join("");

  return `<ol class="step-list">${itemHtml}</ol>`;
};
