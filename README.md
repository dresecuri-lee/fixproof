# FixProof

**[Run the interactive demo](https://dresecuri-lee.github.io/fixproof/) | [Watch the 20-second tour](https://dresecuri-lee.github.io/fixproof/media/fixproof-walkthrough.mp4) | [Inspect a real browser report](evidence/browser-run.json)**

Don't take my word. Run the fix.

[![FixProof interactive repair lab preview](media/preview.png)](https://dresecuri-lee.github.io/fixproof/)

The video combines actual captured demo states, with captions. It is not real-time benchmark playback.

FixProof is a dependency-free static portfolio app for demonstrating small web repairs with browser-observed evidence. It contains three original synthetic cases: an over-rendered 6,000-item catalog, a 390px mobile overflow, and a local form with a dead button.

The before states are intentionally broken only inside their previews. No client work, customer data, external assets, analytics, or network form submission is included.

Have a small website issue? [Send the bug, budget and deadline on X](https://x.com/bedi_samir53094). Please share public details only in GitHub issues.

The checked-in browser report is one observed run, not a performance guarantee. The live app always starts pending and measures again on your device.

## Run locally

Requirements: Python 3 and Node.js 20 or newer.

```bash
python3 -m http.server 3020 --bind 127.0.0.1
```

Open `http://127.0.0.1:3020/`, select any case, or choose **Run all checks**.

Tests and syntax checks:

```bash
node --test
node --check app.js
node --check core.js
```

## 한국어 빠른 시작

이 저장소에서 `python3 -m http.server 3020 --bind 127.0.0.1`을 실행하고 브라우저에서 `http://127.0.0.1:3020/`을 엽니다. **Run all checks**를 누르면 현재 브라우저가 세 합성 fixture를 직접 검사하고, 실행 뒤 JSON 증거 보고서를 내려받거나 복사할 수 있습니다. 폼은 로컬 데모이며 어떤 고객 데이터도 서버로 전송하지 않습니다.

## What each case proves

- **Heavy page:** both variants share one deterministic 6,000-item catalog and search function. The before fixture mounts all matching cards. The fixed fixture reports the same match count and visible label order while mounting only 18 cards. The check compares the rendered fixture DOM, not only catalog data.
- **Mobile overflow:** the browser measures `scrollWidth` and `clientWidth` on the same 390px fixture markup used by the previews. The before content is 520px wide; the fixed content resolves to its viewport. The preview is displayed at reduced scale, while its CSS viewport remains 390px.
- **Dead button:** browser checks click the actual local fixture. The before button has no handler. The fixed button rejects empty input and confirms valid input without a request.

## Evidence report

Results are pending on load. A report becomes available only after a real run. It contains:

- all individual timing samples and their median;
- DOM card counts and catalog sample count;
- before-bug and fixed-pass assertions for every case;
- rendered overflow dimensions and actual form messages;
- user agent, language, viewport, fixture version, and timestamp.

The Heavy page result area also shows the last run's Before and Fixed median DOM update and frame-aligned elapsed times. It stays Pending until measured and never calculates a claimed improvement percentage.

Heavy-page timing uses `performance.now()` around DOM creation and insertion in a hidden measurement container. `domUpdateMs` ends after insertion. `frameAlignedElapsedMs` ends after two animation-frame callbacks; it is not an authoritative paint-completion measurement. The report includes `medianDomUpdateMs` and `medianFrameAlignedElapsedMs` plus five raw samples in alternating before/fixed order. These are synthetic fixture measurements, not Lighthouse scores or Web Vitals. Timings vary with browser, hardware, extensions, tab visibility, and current device load. A slower fixed timing is reported as observed; the repair assertion is based on bounded DOM and rendered search parity, not a promised speedup.

The exported JSON schema is represented by the report object produced in `app.js`. A report is internally consistent when `validateEvidenceReport` in `core.js` accepts its fixture version, environment, three findings, timing block, and derived status.

## Static deployment

Everything is served directly from the repository root with relative asset paths, so the same files work at `/fixproof/` on GitHub Pages.

1. Publish this directory as the root of the `dresecuri-lee/fixproof` repository.
2. In repository settings, choose **Pages**, **Deploy from a branch**, `main`, and `/ (root)`.
3. The expected public URL is `https://dresecuri-lee.github.io/fixproof/`.

There is no build step and no runtime dependency. After the first load, the app itself needs no external font, image, API, or service.

## Credits

The fixtures and interface are original and synthetic. The project was built with AI assistance and is intended to be reviewed through its source, automated tests, and real browser run rather than by unchecked claims.
