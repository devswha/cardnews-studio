const { escapeHtml, safeClassSuffix } = require("./_utils");

function formatCodeLine(line) {
  return escapeHtml(line).replace(/\r?\n/g, "<br>");
}

module.exports = function renderCodeEditor(block = {}) {
  const title = escapeHtml(block.title || "");
  const lines = Array.isArray(block.lines) ? block.lines : [];

  const lineHtml = lines
    .map((line) => {
      const lineType = safeClassSuffix(line && line.type, "code");
      const indent = Number.isFinite(Number(line && line.indent)) ? Math.max(0, Number(line.indent)) : 0;
      const indentPx = indent * 16;
      const textHtml = formatCodeLine(line && line.text);

      return `<div class="code-line code-line--${lineType}" style="padding-left:${indentPx}px;">${textHtml}</div>`;
    })
    .join("");

  return `<div class="code-editor">
  <div class="code-editor-header">
    <div class="code-editor-dots">
      <span class="code-editor-dot code-editor-dot--red"></span>
      <span class="code-editor-dot code-editor-dot--yellow"></span>
      <span class="code-editor-dot code-editor-dot--green"></span>
    </div>
    <span class="code-editor-title">${title}</span>
  </div>
  <div class="code-editor-body">${lineHtml}</div>
</div>`;
};
