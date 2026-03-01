# Multi-Model Review Summary: card-news 렌더링 파이프라인

**Date:** 2026-02-28
**Models:** Opus 4.6, Codex-5.3, GPT-5.2, Gemini-3.1

## Executive Summary

card-news 렌더링 파이프라인은 YAML→HTML→PNG 변환을 4단계로 분리한 ~700줄 규모의 경량 CLI 도구다. 순수 함수 블록 렌더러, CSS 변수 기반 테마 시스템, 방어적 기본값 처리 등 소규모 프로젝트에 적합한 설계를 갖추고 있다.

4개 모델이 공통으로 지적한 핵심 문제는 두 가지다. 첫째, `renderer.js:83`의 고정 3초 `setTimeout`이 슬라이드당 무조건 적용되어 10장 렌더링 시 30초 이상 소요된다. 둘째, 테스트가 전무하여 12개 블록 렌더러와 파서, 렌더러 모두 회귀 검증 없이 운영되고 있다. 이 외에 SVG MIME 타입 오류, 폰트/에셋 로딩 실패 시 무경고 처리, 슬라이드 번호 중복 미검출 등 구체적 버그가 확인되었다.

권장 방향은 현재 아키텍처를 유지하면서 이벤트 기반 렌더링 대기, 에러 가시성 확보, 단위 테스트 추가를 우선 적용하는 것이다. Satori 등 대체 엔진으로의 전환은 현재 규모에서는 시기상조로, 4개 모델 중 3개(Opus, Codex, GPT-5.2)가 점진적 최적화를 권장했다.

## Consensus Points

| Finding | Opus | Codex | GPT-5.2 | Gemini |
|---------|:----:|:-----:|:-------:|:------:|
| 고정 3초 setTimeout이 최대 성능 병목 | HIGH | MEDIUM | HIGH | HIGH |
| 테스트 완전 부재 — 회귀 검증 불가 | HIGH | LOW | HIGH | HIGH |
| 폰트/에셋 로딩 실패 시 silent fail | MEDIUM | MEDIUM | HIGH | - |
| `fs.readFileSync` 동기 I/O가 비동기 파이프라인에 혼재 | MEDIUM | - | - | MEDIUM |
| 슬라이드 번호 중복 미검출 | LOW | LOW | LOW | - |
| 순수 함수 블록 렌더러 패턴이 잘 설계됨 (강점) | Y | Y | Y | Y |
| XSS 방지를 위한 escapeHtml 일관 적용 (강점) | Y | Y | - | - |
| CSS 토큰 기반 테마 시스템의 확장성 (강점) | Y | - | - | Y |
| 현재 규모에서 아키텍처가 적절 (강점) | Y | Y | Y | Y |

## Divergent Perspectives

### Satori 마이그레이션 타이밍

- **Opus:** 언급하지 않음. 현재 파이프라인 최적화에 집중
- **Codex-5.3:** 언급하지 않음. 버그 수정과 테스트 추가를 우선시
- **GPT-5.2:** "시기상조" — 한국어 가변 폰트 렌더링 미검증, 2-4주 리라이트 비용이 현재 규모에 비해 과도. 렌더 볼륨이 500+ 슬라이드/실행을 넘길 때 재검토 권장
- **Gemini-3.1:** 장기 확장성을 위해 Satori 프로토타이핑을 Priority 4로 제안. 속도 10-50배 향상 가능하나 CSS 서브셋 제약 인정

### 병렬 렌더링 접근

- **Opus:** 여러 페이지를 동시에 열어 2-3개 concurrent 처리 제안
- **Codex-5.3:** 패치 플랜에 포함하지 않음 (버그 수정 우선)
- **GPT-5.2:** "복잡도 대비 가치 없음" — <10개 슬라이드에서 브라우저 풀/병렬 페이지 불필요
- **Gemini-3.1:** Playwright + Worker Pool을 대안으로 제시하되, 브라우저 엔진 오버헤드 여전함을 인정

### 에러 처리 전략

- **Opus:** `console.warn()` 추가로 충분
- **Codex-5.3:** `console.warn()` + null 반환으로 caller 측 가드 활용
- **GPT-5.2:** `--strict` 플래그와 `--continue-on-error` 플래그 양방향 제안. 현재 fail-fast는 콘텐츠 저작 도구에 적절하다고 평가
- **Gemini-3.1:** 비동기화와 캐싱에 초점

## Unique Insights

### From Opus 4.6
- `template-engine.js:117-131`의 fallback HTML 자동 생성 기능과 `load()` 중복 호출 방지(`if (this.loaded) return`) 등 방어적 설계 세부 확인
- CSS가 모든 슬라이드에 중복 인라인되는 구조적 비효율 (10장 × 4개 CSS = 10번 중복)
- `blocks/index.js:34`에서 unknown block type throw가 전체 렌더링을 중단시키는 점 지적

### From Codex-5.3
- **BUG-01:** SVG MIME 타입이 `image/svg`로 잘못 생성 (정확한 값: `image/svg+xml`). `render.js:144`와 `template-engine.js:92` 두 곳에 동일 버그
- **BUG-04:** `page.evaluate(() => document.fonts.ready)`가 실제로 Promise를 await하지 않는 dead code. CDP 경계를 넘는 Promise는 `{}`로 직렬화되어 버려짐
- **24-row 테스트 갭 매트릭스** — 12개 블록 타입, 파서, CLI, 렌더러별 필요 테스트 목록 제공
- **8-step 패치 플랜** — 구체적 코드 변경과 예상 영향도 포함

### From GPT-5.2
- **콘텐츠 클리핑 위험 (FM2):** 블록이 1350px 뷰포트를 초과하면 Puppeteer가 하단을 무경고로 잘라냄. `document.body.scrollHeight` 체크로 5줄 수정으로 해결 가능
- **3가지 아키텍처 커플링 포인트** 식별: (1) 블록이 레이아웃에 피드백 불가, (2) CSS가 전역 인라인, (3) 렌더러가 콘텐츠 준비 상태를 모름
- **Decision Memo:** "하지 말아야 할 것" 목록 — 브라우저 풀, TypeScript 전환, 빌드 스텝 추가 모두 현재 규모에서 불필요

### From Gemini-3.1
- **Canvas API / Skia 대안** — 브라우저 없이 직접 드로잉. 극도로 빠르지만 flexbox/텍스트 래핑 재구현 비용이 높음
- **Prior Art:** Remotion(React 기반 비디오), Marp(Markdown→프레젠테이션)과의 아키텍처 유사성
- **평가 계획:** 성능 벤치마크(10장 5초 이내), 리소스 모니터링(50배치 OOM 방지), 시각적 회귀 테스트(pixelmatch), 개발자 속도(새 블록 추가 시간)

## Consolidated Recommendations

| Priority | Recommendation | Effort | Supported By |
|:--------:|----------------|:------:|:------------:|
| **P0** | `setTimeout(r, 3000)` → `page.waitForNetworkIdle({idleTime: 500})` + `document.fonts.ready` 기반으로 교체 | 1시간 | Opus, Codex, GPT-5.2, Gemini |
| **P0** | SVG MIME 타입 수정 (`image/svg` → `image/svg+xml`). `render.js:144`와 `template-engine.js:92` 두 곳 | 15분 | Codex |
| **P1** | 폰트/에셋 로딩 실패 시 `console.warn()` 추가 — silent fail 제거 | 15분 | Opus, Codex, GPT-5.2 |
| **P1** | 뷰포트 오버플로 감지 — 스크린샷 후 `scrollHeight > 1350` 체크 및 경고 | 30분 | GPT-5.2 |
| **P1** | `renderer.js:33-38` dead `page.evaluate(document.fonts.ready)` 코드 제거 | 15분 | Codex |
| **P2** | 슬라이드 번호 중복 검출 추가 (`parser.js` sort 후 duplicate throw) | 15분 | Opus, Codex, GPT-5.2 |
| **P2** | 12개 블록 렌더러 단위 테스트 — `node:test` 내장 러너 사용, 순수 함수이므로 즉시 가능 | 2-3시간 | Opus, Codex, GPT-5.2, Gemini |
| **P2** | MIME 해석 로직을 공유 유틸(`src/utils/asset.js`)로 추출 — 중복 제거 | 30분 | Codex |
| **P3** | `resolveIconUrl` 비동기화 (`fs.readFileSync` → `fs.promises.readFile`) | 30분 | Opus, GPT-5.2, Gemini |
| **P3** | Puppeteer 정확한 버전 핀 + `package-lock.json` 버전 관리 | 15분 | GPT-5.2 |
| **P4** | 시각적 회귀 테스트 (baseline PNG + pixelmatch 비교) | 2-3시간 | GPT-5.2, Gemini |
| **P4** | Satori 프로토타입 — 한국어 가변 폰트 2x 렌더링 검증 후 결정 | 1-2주 | Gemini, GPT-5.2(조건부) |

## Individual Reviews

- [Opus 4.6](opus_review.md) — 코드베이스 근거 분석 (파일:라인 인용, 코드 흐름 추적)
- [Codex-5.3](codex_review.md) — 구현 비평 (5개 버그, 24-row 테스트 갭, 8-step 패치 플랜)
- [GPT-5.2](gpt52_review.md) — 아키텍처 & 리스크 (3개 옵션, 8개 리스크, 6개 실패 모드)
- [Gemini-3.1](gemini_review.md) — 전략적 대안 (3개 접근법, 산업 관행, 평가 계획)
