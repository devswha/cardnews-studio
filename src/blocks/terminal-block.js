const { escapeHtml, highlightWord, safeClassSuffix } = require("./_utils");

module.exports = function renderTerminalBlock(block = {}) {
  const title = escapeHtml(block.title || "Terminal");
  const lines = Array.isArray(block.lines) ? block.lines : [];

  const lineHtml = lines
    .map((line) => {
      const lineType = safeClassSuffix(line && line.type, "output");
      const textHtml = highlightWord(line && line.text, line && line.highlight, "highlight").replace(
        /\r?\n/g,
        "<br>"
      );
      return `<div class="terminal-line terminal-line--${lineType}">${textHtml}</div>`;
    })
    .join("");

  return `<div class="terminal-block">
  <div class="terminal-header">
    <div class="terminal-dots">
      <span class="terminal-dot terminal-dot--red"></span>
      <span class="terminal-dot terminal-dot--yellow"></span>
      <span class="terminal-dot terminal-dot--green"></span>
    </div>
    <span class="terminal-title">${title}</span>
  </div>
  <div class="terminal-body">${lineHtml}</div>
</div>`;
};
