const { escapeHtml, nl2br } = require("./_utils");

function colorStyle(color, variableName) {
  if (!color) {
    return "";
  }
  return ` style="${variableName}: ${escapeHtml(color)};"`;
}

module.exports = function renderTable(block = {}) {
  const rows = Array.isArray(block.rows) ? block.rows : [];
  const rawColumns = Array.isArray(block.columns) ? block.columns : [];

  const labelColumn = rawColumns[0] || { header: "" };
  const dataColumns = rawColumns.length > 1 ? rawColumns.slice(1) : [];
  const derivedColumnCount = Math.max(
    dataColumns.length,
    ...rows.map((row) => (Array.isArray(row && row.cells) ? row.cells.length : 0)),
    0
  );

  const normalizedColumns = Array.from({ length: derivedColumnCount }).map((_, index) => dataColumns[index] || {});

  const headerHtml = [
    `<th class="table-header table-header--label"${colorStyle(
      labelColumn.highlight_color,
      "--table-header-highlight-color"
    )}>${escapeHtml(labelColumn.header || "")}</th>`,
    ...normalizedColumns.map(
      (column) =>
        `<th class="table-header"${colorStyle(
          column.highlight_color,
          "--table-header-highlight-color"
        )}>${nl2br(column.header || "")}</th>`
    ),
  ].join("");

  const bodyHtml = rows
    .map((row) => {
      const rowCells = Array.isArray(row && row.cells) ? row.cells : [];
      const cellsHtml = normalizedColumns
        .map((_, index) => {
          const cell = rowCells[index] || {};
          return `<td class="table-cell"${colorStyle(
            cell.highlight_color,
            "--table-cell-highlight-color"
          )}>${nl2br(cell.text || "")}</td>`;
        })
        .join("");

      return `<tr class="table-row">
  <th class="table-row-label">${nl2br(row && row.label)}</th>
  ${cellsHtml}
</tr>`;
    })
    .join("");

  return `<div class="table-block">
  <table class="table">
    <thead>
      <tr class="table-head-row">${headerHtml}</tr>
    </thead>
    <tbody>
      ${bodyHtml}
    </tbody>
  </table>
</div>`;
};
