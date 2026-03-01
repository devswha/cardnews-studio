#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");

const DEFAULT_MODEL = "gemini-3.1-flash-image-preview";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const STYLE_PROMPT = `Style requirements:
- Isometric pixel art illustration
- The background MUST be a single flat solid color #121212 with NO gradients, NO vignettes, NO lighting effects, NO variations
- The illustration should float on the #121212 background with NO visible border, NO bounding box, NO frame around it
- Use lime green (#B8FF01) as accent color
- No text, letters, or words in the image
- Clean, minimal composition with transparent/seamless edges that blend into the background
- Tech/developer themed
- The illustration should look like it naturally belongs on a #121212 dark surface`;

async function loadApiKey() {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
  ];
  for (const envPath of candidates) {
    try {
      const content = await fs.readFile(envPath, "utf8");
      const match = content.match(/gemini_api_key=(.+)/i);
      if (match) return match[1].trim();
    } catch {}
  }
  throw new Error("gemini_api_key not found in .env");
}

function buildPrompt(meta, sourceContent) {
  const topic = (meta.title || "").replace(/\\n/g, " ").replace(/\n/g, " ");
  const subtitle = (meta.subtitle || "").replace(/\\n/g, " ").replace(/\n/g, " ");

  let prompt = `Create an isometric pixel art illustration for a tech article cover.\n\nTopic: "${topic}"`;
  if (subtitle) {
    prompt += `\nSubtitle: "${subtitle}"`;
  }
  if (sourceContent) {
    const trimmed = sourceContent.slice(0, 500).replace(/\n+/g, " ");
    prompt += `\n\nArticle context: ${trimmed}`;
  }
  prompt += `\n\n${STYLE_PROMPT}`;
  return prompt;
}

async function callGemini(apiKey, prompt, model) {
  const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData);

  if (!imagePart) {
    throw new Error("No image returned from Gemini API");
  }

  return Buffer.from(imagePart.inlineData.data, "base64");
}

async function readSourceContent(meta) {
  if (!meta.source_file) return "";

  const [sourceBase, tipNumber] = meta.source_file.split("#");
  const candidates = [
    path.resolve(process.cwd(), sourceBase),
    path.resolve(process.cwd(), "..", sourceBase),
  ];

  let fullContent = "";
  for (const p of candidates) {
    try {
      fullContent = await fs.readFile(p, "utf8");
      break;
    } catch {}
  }
  if (!fullContent) return "";

  // Extract specific section if tip number is given (e.g. #13 → ### 13)
  if (tipNumber) {
    const marker = `### ${tipNumber}`;
    const startIdx = fullContent.indexOf(marker);
    if (startIdx !== -1) {
      const rest = fullContent.slice(startIdx + marker.length);
      const nextHeading = rest.match(/\n### \d/);
      const endIdx = nextHeading
        ? startIdx + marker.length + nextHeading.index
        : fullContent.length;
      return fullContent.slice(startIdx, endIdx).trim();
    }
  }

  return fullContent;
}

async function updateSpecIllustration(specPath, imgName) {
  let content = await fs.readFile(specPath, "utf8");

  if (/^\s*cover_illustration:/m.test(content)) {
    content = content.replace(
      /^(\s*cover_illustration:).*$/m,
      `$1 "${imgName}"`
    );
  } else if (/^\s*created_at:/m.test(content)) {
    content = content.replace(
      /^(\s*created_at:.*$)/m,
      `$1\n  cover_illustration: "${imgName}"`
    );
  } else {
    content = content.replace(
      /^(meta:\s*\n)/m,
      `$1  cover_illustration: "${imgName}"\n`
    );
  }

  await fs.writeFile(specPath, content, "utf8");
}

async function generateCover(specPath, options = {}) {
  const apiKey = await loadApiKey();
  const model = options.model || DEFAULT_MODEL;

  const yaml = require("js-yaml");
  const raw = yaml.load(await fs.readFile(specPath, "utf8"));
  const meta = raw?.meta || {};

  const sourceContent = await readSourceContent(meta);
  const prompt = options.prompt || buildPrompt(meta, sourceContent);

  console.log(`Model: ${model}`);
  console.log(`Prompt:\n${prompt}\n`);
  console.log("Generating illustration...");

  const imageBuffer = await callGemini(apiKey, prompt, model);

  const slug = path.basename(specPath, path.extname(specPath)).replace("topic-", "");
  const imgName = `${slug}-cover.png`;
  const imgDir = path.resolve(process.cwd(), "assets", "illustrations");
  await fs.mkdir(imgDir, { recursive: true });

  const imgPath = path.join(imgDir, imgName);
  await fs.writeFile(imgPath, imageBuffer);
  console.log(`Saved: ${imgPath}`);

  await updateSpecIllustration(specPath, imgName);
  console.log(`Updated spec: cover_illustration = "${imgName}"`);

  return { imgPath, imgName, prompt };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(
      `
Usage: node src/generate-cover.js <spec.yaml> [options]

Options:
  --model NAME    Gemini model (default: ${DEFAULT_MODEL})
  --prompt TEXT   Custom prompt (overrides auto-generated)
  --help, -h      Show this help

Examples:
  node src/generate-cover.js specs/topic-playwright-cli.yaml
  node src/generate-cover.js specs/topic-foo.yaml --model gemini-2.0-flash-exp-image-generation
    `.trim()
    );
    process.exit(0);
  }

  let specPath = null;
  let model = null;
  let prompt = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--model") {
      model = args[++i];
    } else if (arg.startsWith("--model=")) {
      model = arg.slice("--model=".length);
    } else if (arg === "--prompt") {
      prompt = args[++i];
    } else if (arg.startsWith("--prompt=")) {
      prompt = arg.slice("--prompt=".length);
    } else if (!arg.startsWith("--")) {
      specPath = arg;
    }
  }

  if (!specPath) {
    console.error("Error: spec path required");
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), specPath);
  generateCover(resolvedPath, { model, prompt }).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { generateCover, buildPrompt, STYLE_PROMPT, DEFAULT_MODEL };
