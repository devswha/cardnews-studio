Orchestrate 4 AI models (Opus 4.6, Codex-5.3, GPT-5.2, Gemini-3.1) for parallel review on: $ARGUMENTS

Parse arguments: first quoted string is the topic, `--output <dir>` sets output directory (default: `docs/reviews/`), `--context <file>` adds extra context.

## Overview

Fan out a review topic to 4 AI models in parallel, collect individual reviews, then synthesize into a unified summary with consensus points, divergent perspectives, and consolidated recommendations.

**Models:**

| Model | Worker Type | Role |
|-------|-------------|------|
| Opus 4.6 | Claude (self) | Codebase-grounded review -- cites files, traces code flows, provides evidence |
| Codex-5.3 | codex CLI worker | Implementation critic -- code patterns, bugs, test gaps, patch plan |
| GPT-5.2 | codex CLI worker | Architecture & risk assessment -- design tradeoffs, risk register, failure modes |
| Gemini-3.1 | gemini CLI worker | Holistic review & alternatives -- alternative approaches, industry best practices, prior art |

## Usage

```
/multi-model-review "Compare approach A vs B"
/multi-model-review "Architecture review" --output docs/reviews/
/multi-model-review "Performance analysis" --context docs/DESIGN.md
```

## Output

```
{output}/
  SUMMARY.md              # 4-model synthesized summary
  summary.html            # Google Docs paste-ready HTML
  opus_review.md          # Opus 4.6 review
  codex_review.md         # Codex-5.3 review
  gpt52_review.md         # GPT-5.2 review
  gemini_review.md        # Gemini-3.1 review
```

## Prerequisites

**All checks must pass before execution. If any fails, print the error and stop immediately.**

```bash
# 1. tmux session required
[ -z "$TMUX" ] && echo "ERROR: Not inside a tmux session. Run 'tmux' first." && exit 1

# 2. codex CLI required (handles Codex-5.3 + GPT-5.2)
! command -v codex &>/dev/null && echo "ERROR: codex CLI not found. Install: npm install -g @openai/codex" && exit 1

# 3. gemini CLI required
! command -v gemini &>/dev/null && echo "ERROR: gemini CLI not found. Install: npm install -g @google/gemini-cli" && exit 1
```

## Execution Protocol

### Phase 1: Parse Input

- `topic` -- review subject (required, first quoted string)
- `--output` -- output directory path (default: `docs/reviews/`)
- `--context` -- optional context file path

Resolve relative paths against the current working directory.

### Phase 2: Prepare Environment

1. Run pre-flight checks (see Prerequisites). Stop on failure.
2. Create output directory: `mkdir -p {output}`
3. If `--context` provided, read the context file.
4. Gather project context: read `CLAUDE.md`, use Grep/Glob for topic-relevant files.

### Phase 3: Build Review Prompts

Create a **shared context file** and **per-role prompt files**.

#### 3a. Shared Context (`/tmp/mmr_context_{timestamp}.md`)

Opus gathers project context during Phase 2 and writes it here. This file is referenced by all worker prompts.

```markdown
# Review Context: {topic}

## Topic
{topic}

## Project Context
{project context from CLAUDE.md and relevant files}

## Code Evidence
{key code snippets, file excerpts, tree structure relevant to the topic — gathered by Opus via Read/Grep/Glob}

## Additional Context
{content from --context file, if provided}
```

#### 3b. Per-Role Prompt Files

Each worker gets a role-specific prompt at `/tmp/mmr_prompt_{role}_{timestamp}.md`.

**Codex-5.3 prompt** (`/tmp/mmr_prompt_codex_{ts}.md`):

```markdown
# Implementation Critic Review

Read /tmp/mmr_context_{ts}.md for topic and code context.

## Your Role
You are an implementation critic. Focus on the code-level details.

## Required Deliverables
1. Bug risk inventory — potential bugs, edge cases, off-by-one errors
2. Test gap matrix — what is tested vs what should be tested
3. Patch plan — ordered list of code changes with expected impact
4. Code pattern assessment — anti-patterns, duplication, naming issues

## Do NOT Cover
- High-level architecture decisions (GPT-5.2 covers this)
- Alternative approaches or industry comparisons (Gemini covers this)
- If you cannot verify a code claim from the provided context, label it as [ASSUMPTION]

## Output Format
Use the standard review format: Executive Summary, Detailed Analysis, Strengths, Weaknesses/Risks (LOW/MEDIUM/HIGH), Recommendations (priority-ranked), References.

Save your review to {output}/codex_review.md
```

**GPT-5.2 prompt** (`/tmp/mmr_prompt_gpt52_{ts}.md`):

```markdown
# Architecture & Risk Assessment Review

Read /tmp/mmr_context_{ts}.md for topic and code context.

## Your Role
You are an architecture and risk analyst. Focus on design tradeoffs and failure modes.

## Required Deliverables
1. Architecture options matrix — 2-3 approaches with pros/cons
2. Risk register — identified risks with severity and mitigation
3. Failure mode analysis — what can go wrong, blast radius, recovery
4. Decision memo — recommended approach with justification

## Do NOT Cover
- Line-level code quality or specific bug hunting (Codex covers this)
- External prior art or industry comparisons (Gemini covers this)
- If you cannot verify a code claim from the provided context, label it as [ASSUMPTION]

## Output Format
Use the standard review format: Executive Summary, Detailed Analysis, Strengths, Weaknesses/Risks (LOW/MEDIUM/HIGH), Recommendations (priority-ranked), References.

Save your review to {output}/gpt52_review.md
```

**Gemini-3.1 prompt** (`/tmp/mmr_prompt_gemini_{ts}.md`):

```markdown
# Holistic Review & Alternatives

Read /tmp/mmr_context_{ts}.md for topic and code context.

## Your Role
You are a strategic advisor. Focus on the big picture, alternatives, and industry alignment.

## Required Deliverables
1. Alternative approaches — 2-3 different ways to solve the problem with evaluation criteria
2. Industry best practices — how similar problems are solved elsewhere
3. Prior art survey — relevant papers, tools, or frameworks
4. Evaluation plan — how to measure success of the chosen approach

## Do NOT Cover
- Line-level code quality or specific bug hunting (Codex covers this)
- Detailed risk registers or failure mode analysis (GPT-5.2 covers this)
- If you cannot verify a code claim from the provided context, label it as [ASSUMPTION]

## Output Format
Use the standard review format: Executive Summary, Detailed Analysis, Strengths, Weaknesses/Risks (LOW/MEDIUM/HIGH), Recommendations (priority-ranked), References.

Save your review to {output}/gemini_review.md
```

### Phase 4: Parallel Execution

**Start external workers first (non-blocking), then perform Opus review, then wait.**

#### 4a. Start External Workers via tmux

Each model requires explicit CLI flags for correct model selection and headless execution.

**Worker 1 — Codex-5.3: Implementation Critic** (uses codex CLI default model):

```bash
tmux split-window -h "codex exec --sandbox workspace-write 'Read and follow instructions in /tmp/mmr_prompt_codex_{ts}.md'"
```

**Worker 2 — GPT-5.2: Architecture & Risk** (explicit model override):

```bash
tmux split-window -v "codex exec -m gpt-5.2 --sandbox workspace-write 'Read and follow instructions in /tmp/mmr_prompt_gpt52_{ts}.md'"
```

**Worker 3 — Gemini-3.1: Holistic Review & Alternatives** (headless mode with `-p` flag):

```bash
tmux split-window -v "gemini -p 'Read and follow instructions in /tmp/mmr_prompt_gemini_{ts}.md' --yolo"
```

Then poll for output files with `ls {output}/*.md | wc -l` until all 3 appear (timeout: 180s).

#### 4b. Opus Review (self) — Codebase-Grounded Review

While workers run, Claude performs the Opus review directly:
- Trace code flows, cite specific files (`path:line`), and provide concrete evidence
- Use codebase exploration tools (Read, Grep, Glob) to verify claims
- Identify unknowns and flag what cannot be confirmed from the codebase
- Write result to `{output}/opus_review.md`

### Phase 5: Wait for External Workers

Poll for the 3 external review files every 10 seconds (timeout: 180s):

```bash
for i in $(seq 1 18); do
  count=$(ls {output}/codex_review.md {output}/gpt52_review.md {output}/gemini_review.md 2>/dev/null | wc -l)
  [ "$count" -eq 3 ] && break
  sleep 10
done
```

If timeout, check tmux panes (`tmux list-panes`) for errors.

### Phase 6: Verify Results

Check all 4 files exist and are non-empty. If any worker failed, report the error and stop.

### Phase 7: Synthesis -- Generate SUMMARY.md

Read all 4 reviews and write `{output}/SUMMARY.md`:

```markdown
# Multi-Model Review Summary: {topic}

**Date:** {ISO date}
**Models:** Opus 4.6, Codex-5.3, GPT-5.2, Gemini-3.1

## Executive Summary
{2-3 paragraph synthesis}

## Consensus Points
| Finding | Opus | Codex | GPT-5.2 | Gemini |
|---------|:----:|:-----:|:-------:|:------:|
| {finding} | Y | Y | Y | Y |

## Divergent Perspectives
### {Topic}
- **Opus:** {position}
- **Codex-5.3:** {position}
- **GPT-5.2:** {position}
- **Gemini-3.1:** {position}

## Unique Insights
### From Opus / Codex-5.3 / GPT-5.2 / Gemini-3.1

## Consolidated Recommendations
| Priority | Recommendation | Supported By |
|:--------:|----------------|:------------:|
| 1 | {rec} | Opus, Codex, GPT-5.2, Gemini |

## Individual Reviews
- [Opus 4.6](opus_review.md) | [Codex-5.3](codex_review.md) | [GPT-5.2](gpt52_review.md) | [Gemini-3.1](gemini_review.md)
```

### Phase 8: Generate HTML

```bash
python3 -c "
import markdown
with open('{output}/SUMMARY.md') as f: md = f.read()
html = markdown.markdown(md, extensions=['tables', 'fenced_code'])
styled = '<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>' \
  'body{font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:20px;line-height:1.6}' \
  'table{border-collapse:collapse;width:100%%;margin:1em 0}' \
  'th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}' \
  'th{background:#f5f5f5;font-weight:bold}' \
  'h1{color:#1a1a1a;border-bottom:2px solid #333;padding-bottom:8px}' \
  'h2{color:#333;border-bottom:1px solid #ddd;padding-bottom:4px}' \
  'h3{color:#555}code{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-size:.9em}' \
  '</style></head><body>' + html + '</body></html>'
with open('{output}/summary.html','w') as f: f.write(styled)
print('HTML generated')
"
```

If `markdown` module missing: `pip install markdown` then retry. If that fails too, skip HTML only.

### Phase 9: Report

Print status table, clean up `/tmp/mmr_prompt_{timestamp}.md`.

## Troubleshooting

- **Workers timing out?** Check tmux (`tmux ls`), CLI tools (`codex --version`, `gemini --version`).
- **Empty review files?** Check worker task results, verify prompt file is readable.
- **HTML fails?** `pip install markdown`. HTML is the only optional output.

## Cancellation

Say "stop" or "cancel". External workers are cleaned up, Opus review (if written) is preserved.

## Important Notes

- **Opus** = codebase-grounded (cites files, traces code), **Codex** = implementation critic (bugs, patches, tests), **GPT-5.2** = architecture & risk (tradeoffs, failure modes), **Gemini** = holistic alternatives (best practices, prior art)
- Each worker gets a role-specific prompt with unique deliverables and explicit exclusions to prevent overlap
- Non-Opus workers must label repo-specific claims as [ASSUMPTION] if not in the provided context
- Codex-5.3 uses the codex CLI default model; GPT-5.2 requires explicit `-m gpt-5.2` flag
- Gemini requires `-p` flag for headless (non-interactive) mode and `--yolo` for auto-approval
- codex exec requires `--sandbox workspace-write` to save review files
- All 4 reviews must succeed -- no partial synthesis
- Always clean up temp files after completion
