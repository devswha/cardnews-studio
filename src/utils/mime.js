const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");

const MIME_MAP = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function getMimeType(ext) {
  if (!ext) return "application/octet-stream";
  return MIME_MAP[ext.toLowerCase()] || "application/octet-stream";
}

function fileToDataUri(filePath) {
  const ext = path.extname(filePath).slice(1);
  const mime = getMimeType(ext);
  const buf = fs.readFileSync(filePath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function fileToDataUriAsync(filePath) {
  const ext = path.extname(filePath).slice(1);
  const mime = getMimeType(ext);
  const buf = await fsPromises.readFile(filePath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function safePath(baseDir, userInput) {
  const resolved = path.resolve(baseDir, userInput);
  const normalizedBase = path.resolve(baseDir);
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    throw new Error(`Invalid asset path: ${userInput}`);
  }
  return resolved;
}

module.exports = {
  MIME_MAP,
  getMimeType,
  fileToDataUri,
  fileToDataUriAsync,
  safePath,
};
