Research a topic and write a thread markdown file: $ARGUMENTS

Parse arguments: first quoted string is the topic, `--tag <Tip|Github|Class>` sets category (required), `--tone <반말|존댓말>` sets tone (default: 반말), `--repo <github-url>` provides GitHub repo URL (Github tag only).

## Overview

Research the given topic, write a thread markdown file, review it against a structural checklist, apply humanizer pattern correction, then save. The 4-stage pipeline ensures quality before any file is written to disk.

```
Phase 1: 정보 수집 → Phase 2: 내용 작성 → Phase 3: 검토 → Phase 4: Humanizer → Save
```

## Usage

```
/write-thread "Claude MCP 서버 만들기" --tag Tip
/write-thread "Some Cool Repo" --tag Github --repo https://github.com/org/repo
/write-thread "환경 설정 가이드" --tag Class --tone 존댓말
```

## Output

```
../threads/{category}/{NN}-{slug}.md    # Thread file
../threads/index.md                      # Updated index
```

## Execution Protocol

### Phase 0: Parse Input & Determine Next Number

1. Parse arguments:
   - `topic` — first quoted string (required)
   - `--tag` — Tip | Github | Class (required)
   - `--tone` — 반말 | 존댓말 (default: 반말)
   - `--repo` — GitHub URL (optional, required context for Github tag)

2. Map tag to directory:
   - Tip → `tips/`
   - Github → `github/`
   - Class → `class/`

3. Read `../threads/index.md` to determine next number for the given category. Count existing entries and increment by 1.

4. Generate slug from topic (kebab-case, English, max 4 words). Example: "Claude MCP 서버 만들기" → `claude-mcp-server`

### Phase 1: 정보 수집 (Research)

Gather information based on tag type:

**For all tags:**
- Use Context7 MCP (`resolve-library-id` → `query-docs`) to look up any SDK/framework/tool mentioned in the topic
- If Context7 doesn't cover the topic (common for Github repos), WebSearch is the primary source
- Use WebSearch for supplementary information
- Check Anthropic official docs if Claude-related

**For Github tag specifically:**
- If `--repo` provided: use `gh` CLI to fetch repo README, stars, description
  ```bash
  gh repo view {repo-url} --json name,description,stargazerCount,url
  gh api repos/{owner}/{name}/readme -H "Accept: application/vnd.github.raw"
  ```
- Extract key features, use cases, and installation method

**For Tip tag:**
- Focus on practical usage, common mistakes, and CLI commands

**For Class tag:**
- Focus on beginner-friendly explanation, step-by-step approach
- Target audience is non-developers: avoid code-specific terms (string, boolean, UUID, field, type)
- Use everyday language equivalents: "제목", "완료 여부", "만든 날짜" instead of type definitions
- Research practical workflows non-developers can follow (e.g., write features → AI generates PRD)

### Phase 2: 내용 작성 (Plan & Write)

#### Step 1: Plan Content Structure

Based on research, plan the thread:

1. **본문** (≤150 chars): Hook that stops scrolling
   - Use question format ("~해본 적 있는가?", "~가 뭔지 아는가?")
   - Or numbered list format for impact
   - For Github tag: first line must be `[Github] 제목` + GitHub link on next line
   - For Class tag: first line must be `[Class] 제목 — 영문명` format, then context intro before hook

2. **답글 structure** (2-5개): Plan each reply's focus
   - 답글 1: Core explanation / what it is
   - 답글 2: Key features or practical tips
   - 답글 3: Advanced usage or integration (if needed)
   - 답글 4: Installation / getting started (if needed)

   **Class tag 답글 structure** (4-5개):
   - 답글 1: Definition in plain language (technical term → everyday equivalent, e.g., "스펙 = 기획서 = PRD.md")
   - 답글 2: Limitations & practical tips for non-developers (balanced view, acknowledge when approach doesn't fit)
   - 답글 3: Before/after example using everyday language (no code types, no dev jargon)
   - 답글 4: Actionable framework (3 simple things to remember)
   - 답글 5: Summary with bullet-point takeaways

   **Class tag formatting:**
   - Use `👤:` emoji prefix for user prompt examples (NOT code blocks)
   - Avoids code-heavy appearance, feels more like a conversation

#### Step 2: Write Thread

Generate the thread markdown with:

```markdown
---
number: {NN}
tag: {Tag}
title: {Title}
tone: {tone}
created: {YYYY-MM-DD}
---

## 본문
{Hook text, ≤150 chars}
{For Github: include repo URL on second line}

## 답글 1
{Core content}

## 답글 2
{Features/tips}

...
```

**Writing rules:**
- Follow the tone specified (반말: "~한다/~이다", 존댓말: "~합니다/~입니다")
- Be aware of AI writing patterns — Phase 4 will scan and fix these, but avoiding them upfront produces better results
- Keep each 답글 concise (3-5 sentences)
- Include practical examples, CLI commands where relevant
- Base content on researched official documentation

### Phase 3: 검토 (Structural Review)

Perform structural QA on the written thread. This phase checks format and structure only — AI expression patterns are handled in Phase 4.

#### Step 1: Run Checklist

Evaluate against the following 16-item structural checklist:

**구조 (8 items):**
- [ ] Frontmatter has all required fields: number, tag, title, tone, created
- [ ] 본문 is 150 characters or fewer
- [ ] 본문 uses hook format: question ("~해본 적 있는가?"), numbered list, or 답글 유도 ("아래에서 소개한다")
- [ ] [Github] 본문 first line is `[Github] 제목` with repo URL on next line (auto-PASS for non-Github tags)
- [ ] Thread has 2-4 답글 sections
- [ ] Each 답글 is 3-5 sentences
- [ ] Code blocks use correct language tags if present
- [ ] Markdown formatting is valid (no broken links, unclosed blocks)

**톤 (2 items):**
- [ ] Tone matches frontmatter `tone` field consistently (반말 or 존댓말 throughout)
- [ ] No tone mixing within the thread (반말 and 존댓말 in same thread)

**내용 (6 items):**
- [ ] Claims are grounded in official documentation (source priority respected)
- [ ] Practical examples or CLI commands included where relevant
- [ ] [Tip] threads include actionable CLI usage (auto-PASS for non-Tip tags)
- [ ] [Class] 본문 first line is `[Class] 제목` format (auto-PASS for non-Class tags)
- [ ] [Class] threads use non-developer language: no code types (string, boolean), everyday terms only (auto-PASS for non-Class tags)
- [ ] [Class] threads acknowledge limitations, not just "always use this" (auto-PASS for non-Class tags)
- [ ] [Github] threads describe the repo's purpose and key features (auto-PASS for non-Github tags)
- [ ] No unverified claims without explicit caveat

Tag-conditional items are auto-PASS when the tag doesn't match.

#### Step 2: Auto-Fix (if checklist items fail)

If any checklist items fail:

1. Automatically fix structural issues only (mechanical transformations):
   - Add missing frontmatter fields
   - Truncate 본문 to 150 characters
   - Fix markdown heading levels
   - Add missing code block language tags
   - **Do NOT rewrite prose content** — this prevents introducing AI patterns
2. Re-run the checklist on the fixed version
3. If items still fail after 2 fix cycles: proceed with remaining issues noted in report

**Fix cycle is bounded to 2 iterations maximum. Auto-fix only performs mechanical transformations, never prose rewriting.**

#### Step 3: Report & Proceed

Print checklist results and automatically proceed to Phase 4:

```
## Checklist Results

PASS: {count}/18
FAIL: {list of failed items, if any}
```

No user confirmation required. Proceed directly to Phase 4.

### Phase 4: Humanizer

Scan the thread for AI writing patterns and correct flagged expressions.

**How it works:**

1. Read `../humanizer-korean/SKILL.md` and apply its full pipeline to the thread content:
   - The humanizer reads all 6 pattern packs from `../humanizer-korean/patterns/` (27 patterns total)
   - It applies a 2-Phase process: structure-level fixes first, then sentence/vocabulary fixes
   - It runs a self-review pass to verify corrections
   - It preserves the thread's tone (반말/존댓말), technical accuracy, code blocks, and URLs

2. Show a summary of changes:

```
## Humanizer Results

Patterns scanned: 27
Matches found: {count}
Changes applied:
- Pattern {N} ({name}): "{before}" → "{after}" [답글 {M}]
- ...

No matches: Thread is clean.
```

3. If no matches found: print "No AI patterns detected" and proceed to Phase 5.

**Context-window fallback:** If pattern packs exceed available context, run in audit mode (detect and report only) and recommend a manual `/humanizer-kr` pass afterward.

**Important:** This phase reads the humanizer's SKILL.md and pattern files at runtime. Never hardcode pattern lists in this skill file. If patterns are updated in `humanizer-korean/`, this phase automatically picks up the changes.

### Phase 5: Save & Update Index

1. Write the FINAL thread file (post-review, post-humanizer) to `../threads/{category}/{NN}-{slug}.md`

2. Update `../threads/index.md` — append new row to the correct category table:
   ```
   | {NN} | {title} | `{category}/{NN}-{slug}.md` | {tone} |
   ```

### Phase 6: Report

Print summary:
```
Thread created:
  File: threads/{category}/{NN}-{slug}.md
  Category: {Tag}
  Number: #{NN}
  Title: {title}
  Tone: {tone}
  Review: PASS ({N}/16 checks passed)
  Humanizer: {N} patterns fixed
             OR: Clean (no patterns found)
```

## Error Handling

- If `--tag` is missing: print usage and stop
- If topic is empty: print usage and stop
- If `--tag Github` without `--repo`: warn but continue (research via WebSearch only)
- If Context7 or WebSearch fails: continue with available information, note gaps
- If index.md parsing fails: manually count files in the category directory
- If auto-fix exceeds 2 cycles: proceed with remaining issues noted in report
- If humanizer pattern files not found at `../humanizer-korean/patterns/`: warn, skip Phase 4, note in report
- If humanizer context exceeds limits: switch to audit mode, recommend manual `/humanizer-kr` pass
- If pipeline fails mid-phase: report which phase completed and suggest re-running `/write-thread` with the same arguments

## Important Notes

- Always research before writing. Never fabricate technical claims.
- Content not backed by official docs must be marked as unverified
- The 본문 hook is the most critical part — it determines whether people read the rest
- For Github tag, the 본문 must start with `[Github] 제목` and include the repo URL
- Apply the project's source priority: Anthropic docs > Context7 > Official SDK docs > Community
- Phase 3 review runs automatically — no user confirmation needed, proceeds directly to Phase 4
- Phase 4 humanizer reads SKILL.md and pattern files at runtime; updating pattern files automatically improves future threads
- The save happens AFTER both review and humanizer — content is finalized before touching disk
