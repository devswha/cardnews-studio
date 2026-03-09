const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const { EventEmitter } = require("node:events");

const MODULE_PATH = path.resolve(__dirname, "..", "src", "ai-generator.js");
const ORIGINAL_BACKEND = process.env.CARDNEWS_AI_BACKEND;
const VALID_SPEC = {
  meta: {
    title: "AI Summary",
    total_slides: 1,
  },
  slides: [
    {
      slide: 1,
      layout: "cover",
      title: "AI Summary",
      blocks: [],
    },
  ],
};
const VALID_DECK_SPEC = {
  meta: {
    title: "Deck",
    total_slides: 3,
  },
  slides: [
    { slide: 1, layout: "cover", title: "Cover", blocks: [] },
    { slide: 2, layout: "content", title: "Middle", subtitle: "", blocks: [] },
    { slide: 3, layout: "closing", title: "Closing", blocks: [] },
  ],
};

function loadFreshModule(mocks = {}) {
  delete require.cache[MODULE_PATH];

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(MODULE_PATH);
  } finally {
    Module._load = originalLoad;
  }
}

function createSpawnHarness() {
  const calls = [];

  function spawn(command, args = [], options = {}) {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = function setEncoding() {};
    child.stderr.setEncoding = function setEncoding() {};
    child.killSignal = null;
    child.kill = function kill(signal = "SIGTERM") {
      child.killSignal = signal;
      process.nextTick(() => {
        child.emit("exit", null, signal);
        child.emit("close", null, signal);
      });
      return true;
    };

    calls.push({ command, args, options, child });
    return child;
  }

  function resolve(index, stdout, code = 0) {
    const call = calls[index];
    process.nextTick(() => {
      if (stdout) {
        call.child.stdout.emit("data", Buffer.from(stdout));
      }
      call.child.emit("exit", code, null);
      call.child.emit("close", code, null);
    });
  }

  function fail(index, err) {
    const call = calls[index];
    process.nextTick(() => {
      call.child.emit("error", err);
    });
  }

  return { calls, spawn, resolve, fail };
}

function hasOutputFormatJson(args) {
  return args.some((arg, index) => {
    return (arg === "--output-format" && args[index + 1] === "json") || arg === "--output-format=json";
  });
}

function makeClaudeEnvelope(spec = VALID_SPEC) {
  return JSON.stringify({
    result: JSON.stringify({ spec }),
  });
}

function flush() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

describe("ai-generator", () => {
  it("embeds generation preferences in the system prompt", async () => {
    process.env.CARDNEWS_AI_BACKEND = "cli";
    const aiGenerator = loadFreshModule();

    try {
      const prompt = aiGenerator._private.buildSystemPrompt({
        generationOptions: {
          tone: "bold",
          density: "compact",
          intent: "compare",
          slideCount: 7,
        },
      });

      assert.match(prompt, /Tone preference: bold/i);
      assert.match(prompt, /Content density: compact/i);
      assert.match(prompt, /Narrative intent: compare/i);
      assert.match(prompt, /Target slide count: 7/i);
      assert.match(prompt, /Target 7 slides/i);
    } finally {
      process.env.CARDNEWS_AI_BACKEND = ORIGINAL_BACKEND;
    }
  });

  it("builds a slide-variant prompt with action and layout constraints", async () => {
    process.env.CARDNEWS_AI_BACKEND = "cli";
    const aiGenerator = loadFreshModule();

    try {
      const prompt = aiGenerator._private.buildSlideVariantSystemPrompt({
        slideNumber: 2,
        currentLayout: "content",
        action: "suggest-layout",
        preserveLayout: false,
        variantIndex: 1,
        variantCount: 3,
        generationOptions: {
          tone: "technical",
          density: "detailed",
          intent: "action",
          slideCount: 5,
        },
      });

      assert.match(prompt, /Action: suggest-layout/i);
      assert.match(prompt, /You may change the layout/i);
      assert.match(prompt, /Produce option 2 of 3/i);
      assert.match(prompt, /Tone preference: technical/i);
      assert.match(prompt, /Narrative intent: action/i);
      assert.match(prompt, /Keep the slide number exactly 2/i);
    } finally {
      process.env.CARDNEWS_AI_BACKEND = ORIGINAL_BACKEND;
    }
  });

  it("normalizes generated slide variants while preserving the slide number", async () => {
    process.env.CARDNEWS_AI_BACKEND = "cli";
    const aiGenerator = loadFreshModule();

    try {
      const slide = aiGenerator._private.normalizeSlideVariant(
        VALID_DECK_SPEC,
        {
          layout: "split",
          title: "Updated middle slide",
          subtitle: "Sharper framing",
          blocks: [],
        },
        {
          slideIndex: 1,
          preserveLayout: false,
        }
      );

      assert.equal(slide.slide, 2);
      assert.equal(slide.layout, "split");
      assert.equal(slide.title, "Updated middle slide");
    } finally {
      process.env.CARDNEWS_AI_BACKEND = ORIGINAL_BACKEND;
    }
  });

  it("spawns Claude with print/json flags and parses nested JSON output", async () => {
    process.env.CARDNEWS_AI_BACKEND = "cli";
    const harness = createSpawnHarness();
    const aiGenerator = loadFreshModule({
      child_process: { spawn: harness.spawn },
      "node:child_process": { spawn: harness.spawn },
    });

    try {
      const pending = aiGenerator.generateSpec("Turn this article into a card news draft.", {
        theme: "warm",
      });

      await flush();
      assert.equal(harness.calls.length, 1);
      assert.equal(harness.calls[0].command, "claude");
      assert.ok(
        harness.calls[0].args.includes("-p") || harness.calls[0].args.includes("--print"),
        "expected --print/-p flag"
      );
      assert.ok(harness.calls[0].args.includes("--system-prompt"));
      assert.ok(hasOutputFormatJson(harness.calls[0].args), "expected --output-format json");
      assert.equal(
        harness.calls[0].args[harness.calls[0].args.length - 1],
        "Turn this article into a card news draft."
      );
      assert.equal(harness.calls[0].options.shell, false);

      harness.resolve(0, makeClaudeEnvelope());

      const spec = await pending;
      assert.equal(spec.meta.title, VALID_SPEC.meta.title);
      assert.equal(spec.slides.length, 1);
      assert.equal(spec.slides[0].title, VALID_SPEC.slides[0].title);
    } finally {
      process.env.CARDNEWS_AI_BACKEND = ORIGINAL_BACKEND;
    }
  });

  it("rejects text longer than 50,000 characters before spawning Claude", async () => {
    process.env.CARDNEWS_AI_BACKEND = "cli";
    const harness = createSpawnHarness();
    const aiGenerator = loadFreshModule({
      child_process: { spawn: harness.spawn },
      "node:child_process": { spawn: harness.spawn },
    });

    try {
      const oversized = "x".repeat(50001);

      await assert.rejects(
        async () => aiGenerator.generateSpec(oversized),
        /50,?000|too long|limit/i
      );
      assert.equal(harness.calls.length, 0);
    } finally {
      process.env.CARDNEWS_AI_BACKEND = ORIGINAL_BACKEND;
    }
  });

  it("serializes concurrent generations with a lock", async () => {
    process.env.CARDNEWS_AI_BACKEND = "cli";
    const harness = createSpawnHarness();
    const aiGenerator = loadFreshModule({
      child_process: { spawn: harness.spawn },
      "node:child_process": { spawn: harness.spawn },
    });

    try {
      const first = aiGenerator.generateSpec("First draft request.");
      const second = aiGenerator.generateSpec("Second draft request.");

      await flush();
      assert.equal(harness.calls.length, 1, "second generateSpec call should wait for the lock");

      harness.resolve(0, makeClaudeEnvelope());
      await first;

      await flush();
      assert.equal(harness.calls.length, 2, "second call should start after the first finishes");
      assert.equal(harness.calls[1].args[harness.calls[1].args.length - 1], "Second draft request.");

      harness.resolve(1, makeClaudeEnvelope({
        meta: { title: "Second Summary", total_slides: 1 },
        slides: [
          {
            slide: 1,
            layout: "cover",
            title: "Second Summary",
            blocks: [],
          },
        ],
      }));
      const secondResult = await second;
      assert.equal(secondResult.meta.title, "Second Summary");
    } finally {
      process.env.CARDNEWS_AI_BACKEND = ORIGINAL_BACKEND;
    }
  });

  it("rejects when the Claude process times out", async () => {
    process.env.CARDNEWS_AI_BACKEND = "cli";
    const harness = createSpawnHarness();
    const scheduled = [];
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;

    global.setTimeout = function patchedSetTimeout(fn, ms, ...args) {
      const timer = { fn, ms, args, cleared: false };
      scheduled.push(timer);
      return timer;
    };
    global.clearTimeout = function patchedClearTimeout(timer) {
      if (timer) {
        timer.cleared = true;
      }
    };

    const aiGenerator = loadFreshModule({
      child_process: { spawn: harness.spawn },
      "node:child_process": { spawn: harness.spawn },
    });

    try {
      const pending = aiGenerator.generateSpec("This request will time out.");

      await flush();
      assert.equal(harness.calls.length, 1);
      assert.ok(scheduled.some((timer) => timer.ms >= 120000), "expected a 120s timeout");

      const timeout = scheduled.find((timer) => !timer.cleared);
      timeout.fn(...timeout.args);

      await assert.rejects(async () => pending, /time(?:d)? out|timeout/i);
      assert.ok(harness.calls[0].child.killSignal, "expected the child process to be killed");
    } finally {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
      process.env.CARDNEWS_AI_BACKEND = ORIGINAL_BACKEND;
    }
  });

  it("surfaces a helpful error when Claude CLI is unavailable", async () => {
    process.env.CARDNEWS_AI_BACKEND = "cli";
    const harness = createSpawnHarness();
    const aiGenerator = loadFreshModule({
      child_process: { spawn: harness.spawn },
      "node:child_process": { spawn: harness.spawn },
    });

    try {
      const pending = aiGenerator.generateSpec("Hello, Claude.");
      await flush();
      harness.fail(
        0,
        Object.assign(new Error("spawn claude ENOENT"), {
          code: "ENOENT",
        })
      );

      await assert.rejects(async () => pending, /claude|not found|unavailable/i);
    } finally {
      process.env.CARDNEWS_AI_BACKEND = ORIGINAL_BACKEND;
    }
  });
});
