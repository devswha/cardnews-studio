const cardList = require("./card-list");
const terminalBlock = require("./terminal-block");
const codeEditor = require("./code-editor");
const table = require("./table");
const beforeAfter = require("./before-after");
const progressBar = require("./progress-bar");
const barList = require("./bar-list");
const tipBox = require("./tip-box");
const infoBox = require("./info-box");
const highlightBanner = require("./highlight-banner");
const stepList = require("./step-list");
const text = require("./text");

const registry = Object.freeze({
  "card-list": cardList,
  "terminal-block": terminalBlock,
  "code-editor": codeEditor,
  table,
  "before-after": beforeAfter,
  "progress-bar": progressBar,
  "bar-list": barList,
  "tip-box": tipBox,
  "info-box": infoBox,
  "highlight-banner": highlightBanner,
  "step-list": stepList,
  text,
});

function getBlockRenderer(type) {
  return registry[type] || null;
}

function renderBlock(block) {
  const type = block && block.type ? block.type : "";
  const renderer = getBlockRenderer(type);

  if (!renderer) {
    throw new Error(`Unknown block type: ${type}`);
  }

  return renderer(block);
}

module.exports = {
  registry,
  getBlockRenderer,
  renderBlock,
};
