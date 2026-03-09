# cardnews-studio

YAML 기반으로 카드뉴스를 만들고, 웹 에디터에서 바로 수정·렌더·프리뷰할 수 있는 **card news studio** 입니다.

<p align="center">
  <img src="docs/media/editor-demo.gif" alt="cardnews-studio demo" width="900" />
</p>

## What it does

- **YAML → PNG 렌더링**
  - `render.js`
  - Handlebars 템플릿 + Puppeteer 스크린샷 기반
- **웹 에디터**
  - `server.js` + `public/`
  - spec 검색, 메타/슬라이드/블록 편집, 저장, 전체 렌더, 슬라이드별 프리뷰
- **레이아웃/블록 시스템**
  - `templates/`, `styles/`, `src/blocks/`
- **브라우저 테스트 포함**
  - parser / blocks / utils / validation / server / browser E2E

## Screenshots

### Editor overview

<p>
  <img src="docs/media/editor-overview.png" alt="Editor overview" width="900" />
</p>

### Validation before save

<p>
  <img src="docs/media/editor-validation.png" alt="Validation panel and toast" width="900" />
</p>

### Slide-to-preview sync

<p>
  <img src="docs/media/editor-slide-sync.png" alt="Slide card selection syncs preview" width="900" />
</p>

## Project structure

```text
cardnews-studio/
├── render.js
├── server.js
├── public/
├── specs/
├── src/
├── styles/
├── templates/
├── assets/
└── test/
```

## Quick start

### Install

```bash
npm install
```

### Run the web editor

```bash
node server.js
```

Default URL:

```text
http://localhost:3456
```

Use a custom port if needed:

```bash
PORT=4567 node server.js
```

### Render from CLI

```bash
node render.js specs/topic-oh-my-codex.yaml
node render.js specs/topic-oh-my-codex.yaml --slide 3
node render.js specs/topic-oh-my-codex.yaml --theme warm
```

Output:

```text
output/topic-*/01.png ~ NN.png
```

### Optional cover generation

`src/generate-cover.js` can generate a cover illustration when you provide `GEMINI_API_KEY` in a local `.env` file. Keep that file out of git.

## Editor workflow

1. 좌측에서 spec 선택
2. 중앙에서 메타/슬라이드/블록 수정
3. 저장 또는 **Save & Render All**
4. 우측 프리뷰에서 렌더 결과 확인
5. 슬라이드 카드 클릭 시 우측 프리뷰도 같은 슬라이드로 동기화

## Test

```bash
npm test
```

Coverage includes:

- block renderer tests
- YAML parser tests
- helper / validation tests
- Express API tests
- Puppeteer-based editor E2E tests

## Related docs

- `DESIGN.md` — 카드뉴스 시스템 설계 문서

## Repository

- GitHub: https://github.com/devswha/cardnews-studio
