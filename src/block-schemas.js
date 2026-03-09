const fs = require("fs");
const path = require("path");
const vm = require("vm");

let cachedBlockSchemas = null;

function loadBlockSchemas() {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "public", "block-schemas.js"), "utf8");
  return vm.runInNewContext(`${source}\nBLOCK_SCHEMAS;`, {}, {
    filename: "public/block-schemas.js",
  });
}

function getBlockSchemas() {
  if (!cachedBlockSchemas) {
    cachedBlockSchemas = loadBlockSchemas();
  }
  return cachedBlockSchemas;
}

module.exports = {
  getBlockSchemas,
  loadBlockSchemas,
};
