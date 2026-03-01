const { nl2br, safeClassSuffix } = require("./_utils");

module.exports = function renderText(block = {}) {
  const style = safeClassSuffix(block.style, "normal");
  const contentHtml = nl2br(block.content);
  return `<p class="text-block text-block--${style}">${contentHtml}</p>`;
};
