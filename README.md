# cardnews-studio

YAML 스펙으로 카드뉴스 이미지를 만들고, 웹 에디터로 편집/미리보기까지 할 수 있는 Node.js 프로젝트입니다.

## 주요 기능

- **YAML → PNG 렌더링**
  - `render.js`
  - Handlebars 템플릿 + Puppeteer 스크린샷 기반
- **웹 에디터**
  - `server.js` + `public/`
  - spec 검색, 메타/슬라이드/블록 편집, 저장, 전체 렌더, 슬라이드별 프리뷰
- **레이아웃/블록 시스템**
  - `templates/`, `styles/`, `src/blocks/`
- **테스트 포함**
  - parser / blocks / utils / editor helpers / validation / server / browser E2E

## 프로젝트 구조

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

## 시작하기

### 1) 설치

```bash
npm install
```

### 2) 웹 에디터 실행

```bash
node server.js
```

기본 주소:

```text
http://localhost:3456
```

포트를 바꾸려면:

```bash
PORT=4567 node server.js
```

### 3) CLI 렌더

```bash
node render.js specs/topic-oh-my-codex.yaml
node render.js specs/topic-oh-my-codex.yaml --slide 3
node render.js specs/topic-oh-my-codex.yaml --theme warm
```

출력:

```text
output/topic-*/01.png ~ NN.png
```

## 테스트

```bash
npm test
```

포함 범위:

- 블록 렌더러 테스트
- YAML 파서 테스트
- helper / validation 테스트
- Express API 테스트
- Puppeteer 기반 에디터 E2E 테스트

## 에디터 사용 흐름

1. 좌측에서 spec 선택
2. 중앙에서 메타/슬라이드/블록 수정
3. 저장 또는 Save & Render All
4. 우측 프리뷰에서 렌더 결과 확인
5. 슬라이드 카드 클릭 시 우측 프리뷰도 같은 슬라이드로 동기화

## 참고 문서

- `CLAUDE.md` — 프로젝트 작업 가이드
- `DESIGN.md` — 카드뉴스 시스템 설계 문서
- `.claude/skills/` — 로컬 작업용 스킬

## 저장소

- GitHub: https://github.com/devswha/cardnews-studio
