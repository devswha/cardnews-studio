---
name: cardnews
version: 1.0.0
description: |
  마크다운이나 텍스트를 인스타그램/SNS용 카드뉴스 YAML 스펙으로 변환하고,
  PNG 이미지로 렌더링합니다. cardnews-studio 프로젝트 기반.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# cardnews: 텍스트 → 카드뉴스 PNG 생성기

사용자가 제공한 텍스트, 마크다운, 또는 URL의 내용을 분석하여 카드뉴스 YAML 스펙을 생성하고, PNG 이미지로 렌더링하는 스킬입니다.

---

## 1단계: 프로젝트 확인

cardnews-studio가 설치되어 있는지 확인합니다.

```
Glob **/cardnews-studio/render.js
```

설치되지 않은 경우:
```bash
git clone https://github.com/devswha/cardnews-studio.git
cd cardnews-studio && npm install
```

이미 설치된 경우 해당 디렉토리로 이동합니다.

---

## 2단계: CLAUDE.md 읽기

프로젝트의 CLAUDE.md를 읽어 YAML 스펙 형식, 레이아웃 옵션, 블록 타입을 파악합니다.

```
Read CLAUDE.md
```

---

## 3단계: 콘텐츠 분석

사용자가 제공한 콘텐츠(마크다운, 텍스트, URL 등)를 분석합니다.

핵심 메시지, 논리 흐름, 주요 포인트를 파악하여 카드뉴스 구조를 설계합니다.

### 슬라이드 구성 원칙

- **총 슬라이드**: 5~9장 (첫 장 cover, 마지막 장 closing 고정)
- **첫 슬라이드**: `layout: cover` — 핵심 제목으로 호기심 유발
- **마지막 슬라이드**: `layout: closing` — 요약 또는 CTA
- **중간 슬라이드**: 내용에 맞는 레이아웃과 블록 조합
- **한 슬라이드에 블록 1~3개**: 너무 많으면 읽기 어려움
- **레이아웃 다양성**: 같은 레이아웃을 연속 3회 이상 반복하지 않기

### 레이아웃 선택 가이드

| 내용 유형 | 추천 레이아웃 |
|-----------|--------------|
| 문제 제기 | `problem` |
| 개념 설명 | `explanation` |
| 해결책 제시 | `solution` |
| 단계별 안내 | `howto` |
| 비교 | `comparison` |
| 핵심 강조 | `hero` 또는 `minimal` |
| 심화 내용 | `advanced` |
| 프로세스 | `workflow` |

### 블록 선택 가이드

| 표현 목적 | 추천 블록 |
|-----------|----------|
| 여러 항목 나열 | `card-list` |
| 명령어/코드 | `terminal-block` 또는 `code-editor` |
| 전후 비교 | `before-after` |
| 순서가 있는 설명 | `step-list` |
| 팁/주의사항 | `tip-box` 또는 `info-box` |
| 핵심 문구 강조 | `highlight-banner` |
| 데이터 비교 | `table` 또는 `bar-list` |
| 큰 숫자 강조 | `number-stat` |
| 인용문 | `quote-box` |
| 기능/특징 그리드 | `icon-grid` |
| 진행률/비율 | `progress-bar` |
| 일반 텍스트 | `text` |

---

## 4단계: YAML 스펙 생성

분석 결과를 바탕으로 YAML 스펙 파일을 생성합니다.

```
Write specs/{slug}.yaml
```

### 작성 규칙

1. `meta.total_slides`는 실제 슬라이드 수와 일치시킵니다
2. `slide` 번호는 1부터 순차적으로 매깁니다
3. `description`에서 줄바꿈은 YAML `|-` 블록 스칼라 또는 `\n`을 사용합니다
4. `emoji` 필드에는 이모지 문자 또는 숫자 문자열을 넣습니다
5. `blocks: []`는 빈 블록 (cover/closing에서 사용)

### 예시 참고

```
Read examples/hello.yaml
```

---

## 5단계: 렌더링

생성된 YAML 스펙을 PNG로 렌더링합니다.

```bash
node render.js specs/{slug}.yaml
```

결과물 확인:
```bash
ls output/{slug}/
```

---

## 6단계: 결과 보고

사용자에게 결과를 보고합니다:

1. 생성된 슬라이드 수
2. 출력 경로 (`output/{slug}/`)
3. 각 슬라이드의 레이아웃과 핵심 내용 요약

수정이 필요하면 YAML 스펙을 수정하고 다시 렌더링합니다.

---

## 문제 해결

| 증상 | 해결 |
|------|------|
| `puppeteer` 오류 | `npm install` 재실행 |
| 폰트 경고 | 무시 가능 (fallback 폰트 사용) |
| 슬라이드 overflow 경고 | 블록 수 줄이거나 텍스트 축소 |
| 빈 이미지 | YAML 문법 오류 확인 (`node -e "require('js-yaml').load(require('fs').readFileSync('spec.yaml'))"`) |
