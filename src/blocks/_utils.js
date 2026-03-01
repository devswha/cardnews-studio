function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function highlightWord(text, target, className = "highlight") {
  const source = String(text ?? "");
  const keyword = String(target ?? "");

  if (!keyword || !source.includes(keyword)) {
    return escapeHtml(source);
  }

  const highlighted = `<span class="${escapeHtml(className)}">${escapeHtml(keyword)}</span>`;
  return source.split(keyword).map(escapeHtml).join(highlighted);
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.min(100, number));
}

function safeClassSuffix(value, fallback) {
  const safeValue = value ?? fallback ?? "";
  const normalized = String(safeValue)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  return normalized || fallback;
}

module.exports = {
  escapeHtml,
  nl2br,
  highlightWord,
  clampPercent,
  safeClassSuffix,
};
