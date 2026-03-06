# Card News - 카드뉴스 제작 가이드

## 개요

교육용 팁을 인스타그램/쓰레드용 카드뉴스 이미지(1080x1350 @2x)로 변환하는 시스템.

```
YAML 스펙 → render.js (Handlebars + Puppeteer) → PNG 이미지
```

## 렌더링 명령어

```bash
# 전체 슬라이드 렌더링
node render.js specs/topic-{slug}.yaml

# 특정 슬라이드만 렌더링 (미리보기용)
node render.js specs/topic-{slug}.yaml --slide 4

# 테마 적용 렌더링
node render.js specs/topic-{slug}.yaml --theme warm
```

출력: `output/topic-{slug}/01.png ~ NN.png` (2160x2700px, @2x)

---

## Path Conventions

All skills assume cwd is `cardnews-studio/`. Skills are located at `.claude/skills/{name}/SKILL.md`.

| Resource | Path (relative to cardnews-studio/) |
|----------|-------------------------------|
| Thread files | `../threads/{category}/{NN}-{slug}.md` |
| Thread index | `../threads/index.md` |
| YAML specs | `specs/topic-{slug}.yaml` |
| Rendered PNGs | `output/topic-{slug}/01.png ~ NN.png` |
| Cover illustrations | `assets/illustrations/{slug}-cover.png` |
| Humanizer patterns | `../humanizer-korean/patterns/*.md` |
| source_file in YAML | `../threads/{category}/{NN}-{slug}.md` |

Legacy specs may use other `source_file` formats (`thread-tips.md#10`, `threads/tips/12-tailscale.md`). `generate-cover.js` handles fallback resolution for these.

---

## 프로젝트 구조

```
cardnews-studio/
├── render.js               # 엔트리포인트 (CLI 파싱 + 파이프라인 조율)
├── package.json            # node >=18, handlebars + js-yaml + puppeteer
├── specs/                  # YAML 스펙 파일
├── output/                 # 렌더링 결과 PNG
├── examples/
│   └── hello.yaml          # 예시 스펙
├── src/
│   ├── parser.js           # YAML 파싱 + 메타/슬라이드 정규화
│   ├── template-engine.js  # Handlebars 템플릿 + CSS 로딩
│   ├── renderer.js         # Puppeteer 스크린샷 엔진
│   └── blocks/             # 블록별 HTML 생성기
│       ├── index.js        # 블록 레지스트리
│       ├── _utils.js       # 공용 유틸 (escapeHtml, nl2br, highlightWord 등)
│       ├── card-list.js
│       ├── terminal-block.js
│       ├── code-editor.js
│       ├── before-after.js
│       ├── step-list.js
│       ├── tip-box.js
│       ├── info-box.js
│       ├── highlight-banner.js
│       ├── table.js
│       ├── progress-bar.js
│       ├── bar-list.js
│       ├── text.js
│       ├── number-stat.js   # 큰 숫자/통계 블록
│       ├── quote-box.js     # 인용문 블록
│       └── icon-grid.js     # 아이콘 그리드 블록
├── templates/
│   ├── base.html           # HTML 래퍼 (CSS 주입 + 글로벌 푸터)
│   ├── cover.html          # 커버 슬라이드
│   ├── content.html        # 콘텐츠 슬라이드 (공용)
│   ├── content-split.html  # 좌우 분할 레이아웃
│   ├── content-hero.html   # 큰 제목 강조 레이아웃
│   ├── content-minimal.html # 여백 중심 레이아웃
│   └── closing.html        # 클로징 슬라이드
└── styles/
    ├── tokens.css          # 디자인 토큰 (색상, 간격, 그림자, 타이포)
    ├── base.css            # 글로벌 스타일 + 레이아웃 + 폰트 로딩
    ├── components.css      # 블록 컴포넌트 스타일 (BEM 패턴)
    ├── layouts.css         # 추가 레이아웃
    └── themes/
        ├── warm.css        # 웜 라이트 테마 (크림 + 테라코타)
        └── 8bit.css        # 레트로 8비트 픽셀 테마
```

## 렌더링 파이프라인

```
1. CLI 파싱 (--slide, --theme)
2. parseSpec() → {meta, slides} 정규화
3. TemplateEngine 초기화 (CSS 로딩: tokens → base → layouts → components → theme)
4. 슬라이드별 처리:
   a. resolveAssets() → 로컬 아이콘을 base64 data URI로 변환
   b. renderBlocks() → 블록 레지스트리에서 렌더러 호출 → HTML 문자열
   c. renderSlide() → Handlebars 템플릿에 컨텍스트 주입 → 완성 HTML
5. Renderer (Puppeteer) → 1080x1350 @2x 스크린샷 → PNG 저장
```

## 코드 컨벤션

- **JS**: camelCase 변수/함수, CommonJS (`require`/`module.exports`), 빌드 스텝 없음
- **CSS**: BEM 스타일 kebab-case 클래스 (`.card-list`, `.terminal-line--command`)
- **YAML**: snake_case 필드 (`total_slides`, `highlight_word`)
- **파일명**: kebab-case (`terminal-block.js`, `before-after.js`)
- **블록 렌더러 패턴**: 순수 함수, `(block) => HTML string` 반환, XSS 방지용 escapeHtml 필수

---

## 디자인 시스템

### 테마 시스템

기본 테마(다크)와 추가 테마를 지원한다. 테마는 두 가지 방법으로 지정:

```bash
# CLI 플래그 (우선)
node render.js specs/topic-example.yaml --theme warm

# 또는 YAML meta에 지정
meta:
  theme: warm
```

`styles/themes/` 폴더에 CSS 파일을 추가하면 자동으로 새 테마로 인식된다.

#### 기본 테마: 다크 + 라임 액센트 (theme 미지정 시)

| 토큰 | 값 | 용도 |
|------|---|------|
| `--color-primary` | `#B8FF01` (라임) | 강조, 액센트, 하이라이트 |
| `--color-bg-canvas` | `#121212` | 슬라이드 바깥 배경 |
| `--color-bg-surface` | `#1E1E1E` | 콘텐츠 카드 배경 |
| `--color-bg-elevated` | `#2A2A2A` | 카드, 팁박스 등 |
| `--color-text-primary` | `#FFFFFF` | 제목, 강조 텍스트 |
| `--color-text-body` | `#E0E0E0` | 본문 텍스트 |
| `--color-text-muted` | `#888888` | 부제, 보조 텍스트 |
| `--color-border` | `#333333` | 카드/블록 테두리 |

#### warm 테마: 크림 라이트 + 테라코타 액센트 (`theme: warm`)

| 토큰 | 값 | 용도 |
|------|---|------|
| `--color-primary` | `#C8856A` (테라코타) | 강조, 액센트, 하이라이트 |
| `--color-bg-canvas` | `#F5EFE6` (크림) | 슬라이드 바깥 배경 |
| `--color-bg-surface` | `#FFFFFF` | 콘텐츠 카드 배경 |
| `--color-bg-elevated` | `#FFFFFF` | 카드, 팁박스 등 |
| `--color-text-primary` | `#1A1A1A` | 제목, 강조 텍스트 |
| `--color-text-body` | `#555555` | 본문 텍스트 |
| `--color-text-muted` | `#999999` | 부제, 보조 텍스트 |
| `--color-border` | `#E8E0D4` | 카드/블록 테두리 |

warm 테마 특징:
- 커버: 테라코타 단색 배경 + 검정 텍스트
- 터미널/코드 블록: 다크 유지 (라이트 배경에서 대비 효과)
- Before/After: 핑크(`#FFF5F2`) / 그린(`#F2FFF5`) 틴트
- 프로그레스 바: 살몬 그라데이션

#### 8bit 테마: 레트로 픽셀 스타일 (`theme: 8bit`)

레트로 게임 느낌의 픽셀아트 테마.

### 폰트

- **본문**: Pretendard Variable (한글 최적화, CDN 로딩)
- **코드**: JetBrains Mono (CDN 로딩)

### 타이포그래피 규격

| 용도 | font-size | weight | 비고 |
|------|-----------|--------|------|
| 커버 제목 | 82px | 900 | letter-spacing: -1.5px |
| 콘텐츠 슬라이드 제목 | 56px | 900 | |
| 클로징 제목 | 68px | 900 | |
| 카드 제목 | 32px | 800 | |
| 본문/설명 | 24~28px | 400~500 | line-height: 1.65 |
| 터미널/코드 본문 | 28px | 400 | JetBrains Mono |
| 스텝 코드 | 26px | - | 인라인 코드 블록 |
| 코드 에디터 | 26px | - | |

### 슬라이드 크기

- 캔버스: 1080 x 1350px
- 패딩: 60px (상하좌우)
- deviceScaleFactor: 2 (출력 2160x2700px)

---

## YAML 스펙 작성법

### 파일 위치

`specs/topic-{slug}.yaml`

### 메타 구조

```yaml
meta:
  title: "줄바꿈은\\n으로"
  subtitle: "부제목"
  series: "claude-code-recipe"
  tag: "claude-code-recipe"
  theme: warm              # 선택. warm | 8bit | 미지정(기본 다크)
  total_slides: 7          # 5~10장
  source_tip: 10
  source_file: "thread-tips.md#10"
  created_at: "2026-02-24"
```

### 슬라이드 구조 패턴

**짧은 팁 (5~6장)**:
```
cover → problem → solution → howto → closing
```

**상세 팁 (7~10장)**:
```
cover → problem → solution → howto → advanced → workflow → closing
```

### 레이아웃 종류 (12종)

| 레이아웃 | 용도 | 렌더링 템플릿 |
|---------|------|-------------|
| `cover` | 커버 (제목+부제) | cover.html |
| `problem` | 문제 제기, 공감 | content.html |
| `explanation` | 원인/개념 설명 | content.html |
| `solution` | 솔루션 소개 | content.html |
| `howto` | 사용법, 명령어 | content.html |
| `comparison` | 심화 비교 | content.html |
| `advanced` | 고급 팁 | content.html |
| `workflow` | 실전 루틴 | content.html |
| `split` | 좌우 분할 (매거진 스타일) | content-split.html |
| `hero` | 큰 제목 강조 (임팩트) | content-hero.html |
| `minimal` | 여백 중심 (인용/통계) | content-minimal.html |
| `closing` | 요약/마무리 | closing.html |

기본 content 레이아웃 외에 3가지 추가 레이아웃으로 시각적 다양성을 높일 수 있다.

#### split 레이아웃

좌측 35%에 제목/부제, 우측 65%에 블록을 배치하는 매거진 스타일. 시각적 변화를 주기 좋다.

**추천 블록**: card-list, number-stat, quote-box, icon-grid, text, tip-box, info-box, step-list (2개 이하)
**비추천 블록**: before-after, table, terminal-block, code-editor (우측 칼럼이 ~624px로 좁아 레이아웃이 깨질 수 있음)

```yaml
- slide: 3
  layout: split
  title: "좌측 제목"
  subtitle: "좌측 부제"
  blocks:
    - type: icon-grid
      columns: 2
      items: [...]
```

#### hero 레이아웃

상단 45%를 큰 제목 영역(그라데이션 액센트 배경)으로, 하단을 컴팩트한 블록 영역으로 구성. "핵심 인사이트" 슬라이드에 적합.

```yaml
- slide: 4
  layout: hero
  title: "큰 제목"
  subtitle: "보조 설명"
  blocks:
    - type: number-stat
      value: "3x"
      label: "핵심 수치"
```

#### minimal 레이아웃

상단 바/카드 테두리 없이 배경만으로 구성. 콘텐츠가 가운데 정렬. 인용문, 단일 통계 등 여백이 필요한 슬라이드에 적합.

```yaml
- slide: 5
  layout: minimal
  title: "핵심"
  blocks:
    - type: quote-box
      content: "인용문 텍스트"
      author: "출처"
```

---

## 블록 타입 레퍼런스 (15종)

### card-list - 이모지 카드 목록

```yaml
- type: card-list
  items:
    - emoji: "😱"
      title: "카드 제목"
      description: "설명 텍스트\n줄바꿈 가능"
      highlight_word: "강조 단어"  # 라임색 처리, 선택
```

용도: 장점 나열, 문제점 나열, 요약

### terminal-block - 터미널 코드

```yaml
- type: terminal-block
  title: "Terminal"
  lines:
    - type: comment
      text: "# 주석 텍스트"
    - type: command
      text: "> tmux new -s claude"
      highlight: "claude"  # 선택
    - type: output
      text: "출력 결과"
```

용도: CLI 명령어, 실행 예시

### code-editor - 코드 에디터

```yaml
- type: code-editor
  title: "파일명.md"
  lines:
    - type: comment
      text: "# 주석"
    - type: code
      text: "코드 내용"
    - type: list-item
      text: "- 목록 항목"
      indent: 0
```

용도: 설정 파일, 코드 예시

### before-after - 전후 비교

```yaml
- type: before-after
  before:
    emoji: "❌"
    title: "Before 제목"
    description: "설명"
  after:
    emoji: "✅"
    title: "After 제목"
    description: "설명"
```

용도: 변화 비교, 개선 효과

### step-list - 번호 스텝

```yaml
- type: step-list
  items:
    - step: 1
      emoji: "🚀"
      title: "스텝 제목"
      description: "설명"
      code: "tmux new -s my-project"  # 선택, 인라인 코드 블록
```

용도: 실전 워크플로우, 순서가 있는 절차

### tip-box - 팁 박스

```yaml
- type: tip-box
  label: "Tip"
  content: "팁 내용"
  highlight_word: "강조 단어"  # 선택
```

용도: 보충 설명, 꿀팁

### info-box - 정보 박스

```yaml
- type: info-box
  title: "정보 제목"
  content: "설명 텍스트"
  highlight_word: "강조 단어"  # 선택
```

용도: 추천 도구, 참고 정보

### highlight-banner - 강조 배너

```yaml
- type: highlight-banner
  content: "핵심 메시지"
  bold_part: "볼드 처리할 부분"
  inline_code: "/compact"  # 선택, 코드 스타일
```

용도: 핵심 요약, 슬라이드 마무리 메시지

### table - 비교 테이블

```yaml
- type: table
  columns:
    - header: "열 헤더"
  rows:
    - label: "행 라벨"
      cells:
        - text: "셀 내용"
```

### progress-bar - 프로그레스 바

```yaml
- type: progress-bar
  label: "사용량"
  value: 87
  display_text: "87%"
```

### bar-list - 막대 목록

```yaml
- type: bar-list
  items:
    - label: "항목"
      ratio: 80
```

### text - 텍스트 블록

```yaml
- type: text
  content: "텍스트 내용"
  style: normal | muted | accent
```

### number-stat - 큰 숫자/통계 블록

큰 숫자를 강조 표시. hero, minimal 레이아웃과 잘 어울린다.

```yaml
- type: number-stat
  value: "42%"              # 큰 숫자 (필수)
  label: "비용 절감 효과"     # 설명 텍스트 (필수)
  highlight_word: "절감"     # 라임색 강조 (선택)
```

### quote-box - 인용문 블록

인용문과 출처를 시각적으로 강조. minimal 레이아웃과 잘 어울린다.

```yaml
- type: quote-box
  content: "인용문 텍스트"    # 인용문 (필수)
  author: "출처"             # 출처 (선택)
  style: default | accent    # accent: 배경 틴트 추가 (선택)
```

### icon-grid - 아이콘 그리드 블록

2x2 또는 3xN 그리드로 아이템을 배치. card-list의 컴팩트 대안. split 레이아웃과 잘 어울린다.

```yaml
- type: icon-grid
  columns: 2                 # 2 또는 3 (기본: 2)
  items:
    - emoji: "🚀"
      title: "항목 제목"
      description: "설명"    # 선택
```

---

## 콘텐츠 작성 규칙

### 톤 & 스타일

- 반말 기반 간결체 ("~한다", "~이다")
- 한 카드에 핵심 메시지 하나
- 제목은 짧고 임팩트 있게 (2줄 이내)
- 설명은 2~3줄, 줄바꿈(`\n`)으로 가독성 확보

### 슬라이드별 가이드

| 슬라이드 | 목표 | 블록 조합 |
|---------|------|----------|
| cover | 호기심 유발 | (블록 없음) |
| problem | 공감 | card-list (2~3개) |
| solution | 핵심 답 | before-after + highlight-banner |
| howto | 바로 따라하기 | terminal-block + tip-box |
| advanced | 심화 | card-list + info-box |
| workflow | 실전 적용 | step-list (3개) |
| split | 매거진 스타일 | icon-grid + tip-box |
| hero | 핵심 인사이트 | number-stat 또는 highlight-banner |
| minimal | 여백 강조 | quote-box 또는 number-stat |
| closing | 기억에 남기기 | card-list (3개) + highlight-banner |

### 블록 조합 규칙

- 한 슬라이드에 블록 1~2개 (최대 3개)
- card-list 아이템은 2~3개가 적정
- step-list는 3개가 가장 균형 잡힘
- terminal-block 뒤에 tip-box를 붙이면 이해도 높아짐
- 마지막 슬라이드는 highlight-banner로 마무리

### 텍스트 패턴 → 블록 매핑

| 콘텐츠에 이런 내용이 있으면 | 이 블록 사용 |
|--------------------------|------------|
| CLI 명령어, 실행 예시 | terminal-block |
| 장점/단점 나열 | card-list |
| 전후 비교 | before-after |
| 순서가 있는 절차 | step-list |
| 설정 파일 예시 | code-editor |
| 주의사항, 보충 팁 | tip-box / info-box |
| 핵심 한 줄 요약 | highlight-banner |
| 항목별 비교 | table |
| 큰 숫자/통계 강조 | number-stat |
| 인용문, 명언 | quote-box |
| 기능/도구 그리드 | icon-grid |

---

## 수정 가이드

- **색상/간격 변경**: `styles/tokens.css`의 CSS 변수 수정
- **블록 디자인 변경**: `styles/components.css`
- **슬라이드 전체 레이아웃**: `styles/base.css`
- **블록 HTML 구조 변경**: `src/blocks/{블록명}.js`
- **새 블록 추가**: `src/blocks/`에 JS 파일 생성 → `src/blocks/index.js` 레지스트리에 등록
- **새 테마 추가**: `styles/themes/`에 CSS 파일 생성 (tokens.css 변수 오버라이드)
- **블록 공용 유틸**: `src/blocks/_utils.js` (escapeHtml, nl2br, highlightWord, clampPercent)

### 주의: overflow 사용 금지 영역

`.content-body`에 `overflow: hidden`을 추가하지 말 것. `justify-content: center`와 함께 사용하면 콘텐츠가 컨테이너보다 클 때 상단이 잘린다 (step-list 뱃지 등). border-radius가 하단만 적용되므로 overflow 제어가 불필요하다.
