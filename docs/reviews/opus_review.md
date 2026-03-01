# Opus 4.6 Review: card-news 렌더링 파이프라인

**Role:** Codebase-Grounded Analysis
**Date:** 2026-02-28

## Executive Summary

card-news 렌더링 파이프라인은 YAML→HTML→PNG 변환을 명확한 4단계로 분리한 잘 설계된 CLI 도구다. 코드 총량이 ~700줄로 경량이며, 순수 함수 패턴의 블록 렌더러와 CSS 변수 기반 테마 시스템이 확장성을 잘 확보하고 있다. 다만 성능 병목(고정 3초 대기, 단일 페이지 순차 렌더링), 에러 처리 빈틈, 테스트 부재가 주요 개선 포인트다.

## Detailed Analysis

### 1. 파이프라인 흐름 추적

**render.js:181-236** — `main()` 함수가 전체 파이프라인을 조율한다:

```
parseArgs → parseSpec → TemplateEngine.load → [slide loop: resolveAssets → renderBlocks → renderSlide] → Renderer.renderSlides
```

흐름은 선형이고 이해하기 쉽다. 각 단계가 명확한 책임을 갖고, 에러 발생 시 슬라이드 번호와 블록 인덱스를 포함한 컨텍스트를 제공한다 (`render.js:170-178`).

### 2. YAML 파싱 (parser.js)

**강점:**
- `normalizeMeta()`와 `normalizeSlides()`로 방어적 기본값 처리 (`parser.js:27-49`, `parser.js:51-70`)
- 모든 필드에 `toStringOrDefault()`/`toOptionalNumber()` 유틸 적용 — null/undefined 안전
- 슬라이드 자동 정렬 (`parser.js:47`: `normalized.sort((a, b) => a.slide - b.slide)`)

**리스크:**
- `yaml.load()` 사용 (`parser.js:74`) — js-yaml v4에서는 기본 `DEFAULT_SCHEMA`로 안전하지만, 악의적 YAML 입력에 대한 스키마 검증이 없음. 내부 도구이므로 LOW 리스크
- 슬라이드 번호 중복 시 정렬 결과가 비결정적 — 실제 문제 발생 가능성은 낮지만 경고 없이 무시됨

### 3. 템플릿 엔진 (template-engine.js)

**강점:**
- CSS 로딩 순서가 명확 (`template-engine.js:7`: tokens→base→layouts→components)
- 테마 오버라이드가 마지막에 로드되어 CSS cascade 활용 (`template-engine.js:71-81`)
- `base.html` 없을 때 fallback HTML 자동 생성 (`template-engine.js:117-131`)
- `load()` 중복 호출 방지 (`template-engine.js:30-32`: `if (this.loaded) return`)

**리스크:**
- `resolveIllustration()` (`template-engine.js:86-97`)에서 파일 읽기 실패 시 silent fail — 에러 로그 없이 원본 meta 반환. 사용자가 왜 일러스트가 안 보이는지 디버깅 어려움
- **메모리:** 모든 CSS가 `this.stylesCss` 하나의 문자열로 합쳐져 모든 슬라이드 HTML에 인라인 삽입. 10장 슬라이드 × 4개 CSS 파일 = CSS가 10번 중복 포함되어 메모리에 로드됨. 현재 규모에서는 문제 없으나 구조적 비효율

### 4. Puppeteer 렌더러 (renderer.js)

**가장 큰 성능 병목:**

1. **고정 3초 대기** (`renderer.js:83`: `await new Promise(r => setTimeout(r, 3000))`) — 모든 슬라이드마다 무조건 3초를 기다림. 10장 렌더링 시 최소 30초 소요. 폰트/이미지 로딩이 이보다 빨리 끝나도 대기함
2. **순차 렌더링** (`renderer.js:77-92`) — 단일 페이지에서 `for` 루프로 순차 처리. 슬라이드 간 병렬화 없음
3. **`waitForFonts` 타임아웃 무시** (`renderer.js:54-56`) — 폰트 로딩 실패를 silently 무시. 폰트 없이 렌더링되면 결과물 품질 저하

**단일 페이지 재사용** (`renderer.js:67-68`) — 페이지를 한 번 만들어 재사용하는 것은 좋은 패턴. 하지만 `setContent()`로 매번 덮어쓰므로 이전 슬라이드의 사이드이펙트가 남을 가능성은 낮음

**`--no-sandbox`** (`renderer.js:20`) — 로컬 CLI 도구로 적절. 서버 배포 시에는 보안 리스크

### 5. 블록 시스템 (src/blocks/)

**강점:**
- 순수 함수 패턴 일관 적용: `(block) => HTML string` — 테스트 용이, 사이드이펙트 없음
- `Object.freeze(registry)` (`blocks/index.js:14`) — 런타임 변조 방지
- XSS 방지: 모든 블록에서 `escapeHtml()` 사용 확인
  - `card-list.js:8-10`: title, description, emoji 모두 이스케이프
  - `terminal-block.js:10`: highlightWord 내부에서 이스케이프
  - `before-after.js:12-13`: icon_url, title 이스케이프
  - `step-list.js:11`: code 필드도 이스케이프

**리스크:**
- `terminal-block.js:10-13`에서 `highlightWord()` 호출 후 별도로 `.replace(/\r?\n/g, "<br>")` — `_utils.js`의 `nl2br()`을 쓰지 않고 수동 변환. `highlightWord`가 이미 `escapeHtml`을 적용하므로 이중 이스케이프는 아니지만, 패턴 불일치
- `before-after.js:7-8`의 `backgroundStyle()` — 사용자 입력 `bg_color`를 `escapeHtml`로 처리하지만, CSS injection 벡터가 될 수 있음 (`background: url(...)` 등). 내부 도구이므로 LOW 리스크
- `blocks/index.js:34`에서 unknown block type을 throw — 하나의 잘못된 블록이 전체 렌더링을 중단시킴. graceful degradation 없음

### 6. 에셋 해석 (render.js)

- **동기 파일 읽기** (`render.js:142`: `fs.readFileSync`) — `resolveIconUrl()`이 동기 I/O. 비동기 파이프라인 안에서 동기 호출. 아이콘 수가 적어 실질 영향은 미미하나 일관성 부족
- `render.js:144`의 MIME 타입 추론 — `jpg→image/jpeg`, 나머지는 `image/${ext}`. `svg`, `webp` 등은 올바르게 처리되지만, 지원하지 않는 확장자에 대한 경고 없음

### 7. 템플릿 구조

- `base.html:11`의 `global-credit` — 모든 슬라이드에 `made by @vibe.tip` 삽입. 하드코딩된 크레딧이 meta에서 관리되지 않음
- `content.html`에서 `{{slide.title}}`과 `{{slide.subtitle}}`은 Handlebars의 `{{ }}` (이스케이프 처리됨)로 사용 — XSS 안전
- `{{{blocks_html}}}`는 triple-stache (raw) — 의도적. 블록 렌더러가 이미 이스케이프 처리

## Strengths

1. **명확한 관심사 분리** — Parser/TemplateEngine/Renderer/Blocks 각각 독립적 책임
2. **순수 함수 블록 렌더러** — 테스트 가능성 높음, 새 블록 추가 용이
3. **CSS 토큰 시스템** — 46+ CSS 변수로 일관된 디자인 시스템 유지
4. **방어적 기본값** — null/undefined에 대해 모든 레이어에서 안전한 fallback
5. **에러 컨텍스트** — 블록 렌더링 실패 시 슬라이드 번호, 블록 인덱스, 타입 포함
6. **경량 의존성** — handlebars, js-yaml, puppeteer 3개만 사용

## Weaknesses/Risks

| Severity | Finding | Location |
|----------|---------|----------|
| **HIGH** | 고정 3초 대기로 10장 기준 30초+ 렌더링 시간 | `renderer.js:83` |
| **HIGH** | 테스트 완전 부재 — 블록 렌더러가 순수 함수임에도 단위 테스트 없음 | 프로젝트 전체 |
| **MEDIUM** | 순차 렌더링 — 슬라이드 병렬화 미적용 | `renderer.js:77-92` |
| **MEDIUM** | 일러스트/폰트 로딩 실패 silent fail — 디버깅 어려움 | `template-engine.js:95`, `renderer.js:54-56` |
| **MEDIUM** | 동기 파일 읽기 (resolveIconUrl)가 비동기 파이프라인에 혼재 | `render.js:142` |
| **LOW** | CSS가 모든 슬라이드에 중복 인라인 — 구조적 비효율 | `template-engine.js:112` |
| **LOW** | 슬라이드 번호 중복 미검출 | `parser.js:47` |
| **LOW** | `global-credit` 하드코딩 | `base.html:11` |

## Recommendations (Priority-Ranked)

1. **렌더링 대기 최적화** — 고정 3초 대기를 `networkidle0` 또는 `document.fonts.ready` 기반으로 교체. 슬라이드당 1-2초 절약 가능
2. **블록 렌더러 단위 테스트** — 순수 함수이므로 input/output 테스트 작성 용이. `node:test` 내장 러너 사용 권장
3. **병렬 렌더링 옵션** — 여러 페이지를 동시에 열어 슬라이드 병렬 스크린샷 (2-3개 concurrent)
4. **로딩 실패 경고 로그** — `resolveIllustration`, `waitForFonts`에서 실패 시 `console.warn()` 추가
5. **`resolveIconUrl` 비동기화** — `fs.readFileSync` → `fs.promises.readFile`로 변경

## References

- `render.js` (243 lines) — CLI 진입점, 에셋 해석, 파이프라인 조율
- `src/parser.js` (89 lines) — YAML 파싱, 정규화
- `src/template-engine.js` (162 lines) — Handlebars 템플릿, CSS 로딩
- `src/renderer.js` (101 lines) — Puppeteer 스크린샷 엔진
- `src/blocks/index.js` (48 lines) — 블록 레지스트리
- `src/blocks/_utils.js` (49 lines) — 공용 유틸리티
- `src/blocks/card-list.js`, `terminal-block.js`, `before-after.js`, `step-list.js` — 대표 블록 렌더러
- `templates/base.html`, `content.html` — Handlebars 템플릿
