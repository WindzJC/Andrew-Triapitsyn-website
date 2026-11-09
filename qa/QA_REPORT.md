# QA report: Andrew Triapitsyn author homepage concept

**Build tested:** `site/index.html` (local file)
**Run:** 10 Nov 2026 (local time) · headless Chrome 156.0.8078.80 on Windows 11, driven over the DevTools Protocol by `qa/tools/qa-run.mjs`
**Raw results:** `qa/qa-results.json` · **Screenshots:** `qa/screenshots/` (24 files)

## Result: PASS, with the caveats listed under "Not verified"

| Check | 1440 | 1024 | 390 | 320 | Notes |
|---|---|---|---|---|---|
| Renders, fonts load (Cormorant, Plex Sans, Plex Mono) | PASS | PASS | PASS | PASS | |
| Horizontal overflow | PASS (none) | PASS | PASS | PASS | `scrollWidth` = viewport width at every size; no element extends past the edge |
| JS console errors/warnings | PASS (0) | PASS (0) | PASS (0) | PASS (0) | Includes failed resource loads |
| Author identity in first viewport | PASS | PASS | PASS | PASS | Name, "Fiction & Nonfiction", lede and primary action |
| Featured cover in first viewport | PASS | PASS | PASS | **Partial** | At 320 × 640 the featured card begins just below the fold. The secondary hero button already names the book |
| Cover fidelity (aspect ratio, no crop/distortion) | PASS | PASS | PASS | PASS | Max ratio difference 0.0017; `object-fit: contain` for cover, thumb uses the same art |
| Images have alt text | PASS | PASS | PASS | PASS | Decorative catalogue thumbnail uses `alt=""` (the link text names the book) |
| Text contrast (WCAG AA) | PASS (132 checked) | PASS (132) | PASS (126) | PASS (126) | Lowest ratio 5.71:1 (shelf lede on parchment) |
| Touch/tap targets ≥ 44 × 44 px | PASS (26/26) | PASS (26/26) | PASS (22/22) | PASS (22/22) | |
| Landmarks | PASS | | | | 1 header, 2 nav (primary, footer), 1 main, 1 footer; single H1; logical H2/H3 order |

### Functional tests
| Test | Result | Evidence |
|---|---|---|
| **Inspect the frame:** mouse click selects layer 3, only caption 3 shows, ring 3 highlighted; ArrowRight moves to 4, then 5 | PASS | `interaction-inspect-layer3-desktop.png`, `interaction-inspect-layer5-desktop.png` |
| **Keyboard:** 26 Tab stops in logical order; every stop shows a 2 px focus outline (oxblood on paper, gold on dark); radio group is a single stop | PASS | `qa-results.json → tests.keyboard` |
| **Skip link:** first Tab stop; Enter moves focus to `<main>` | PASS | `keyboard-skip-link-desktop.png` |
| **Mobile menu (390):** opens; `aria-expanded` toggles; Escape closes and returns focus to the button; choosing a link closes the menu and lands on the section | PASS | `mobile-390-menu-open.png` |
| **Reduced motion:** all 45 reveal elements visible at load, transitions 0s, smooth scroll off | PASS | `mobile-390-reduced-motion-first-viewport.png` |
| **JavaScript disabled:** all content visible, nav links shown inline, interaction still works via CSS `:has()` | PASS | `mobile-390-no-js-first-viewport.png` |
| **Scalability:** inject 3 sample series / 9 sample books (test only, never in `site/`); no overflow, no layout change | PASS at 1440 and 390 | `scalability-test-*-INTERNAL-SAMPLE-DATA.png` |
| **Links:** 10 unique; 7 in-page anchors resolve; Google Play listing HTTP 200; illusionsbook.com HTTP 200; mailto well-formed; all `target=_blank` have `rel=noopener` | PASS | `qa-results.json → tests.links` |
| Local preview command (`python -m http.server … --bind 127.0.0.1`) serves page, CSS, JS, images (all 200) | PASS | Run during QA; server stopped afterwards |
| `site/` contains no internal notes (Gmail link, research brief, correspondence) | PASS | Text search of `site/` |

### Screenshots
- First viewport: `desktop-1440-first-viewport.png`, `desktop-1024-first-viewport.png`, `mobile-390-first-viewport.png`, `mobile-320-first-viewport.png`
- Full page: `…-full-page.png` for each of the four widths
- Section views (1440, 390): `…-section-writing.png`, `…-section-featured.png`, `…-section-inspect.png`, `…-section-sources.png`

## Defects found during QA and fixed (all re-tested)
1. **Mobile showed the cover twice in a row** (hero panel, then the featured section). The hero panel is now a compact cover-and-title card below 640 px, which also brings the book into the first screen at 390.
2. **Diagram labels unreadable** (about 6–7 px rendered). Enlarged to 15 px desktop / 21 px mobile in SVG units, and the panel was re-laid out with the intro on top so the diagram has more width.
3. **Featured-section cover sat about 110 px too low.** `overflow: hidden` on the section broke the cover's `position: sticky`. Fixed with `overflow: clip` (`hidden` kept as fallback).
4. **Mobile layer buttons used `:nth-child`,** which counted the hidden `<legend>`, so the grid was unintended. Now a deliberate 2 + 2 + 1 grid. The QA selector had the same bug and was fixed too.
5. **Header highlighted the wrong nav item** ("Sources") while viewing "Inside the book". Every section now maps to a nav item or to none.
6. **Long series names wrapped badly** in the scalability test. The series header is now label/count on one line with the title beneath.
7. **Mobile menu dividers** didn't span the full width. Fixed.
8. Minor: ledger numerals aligned to centre; footer rule spans the full width; dark sections given a solid fallback background colour.

## Not verified (honest gaps)
- **Browsers:** only Chromium (Chrome 156) was tested. Safari/iOS, Firefox and Samsung Internet were not. Mobile was emulated (viewport + touch), not run on physical phones.
- **Assistive technology:** no NVDA/JAWS/VoiceOver session. Landmarks, headings, labels, alt text, focus order and live-region markup were checked structurally only.
- **Contrast:** checked against solid composited backgrounds. Text over the subtle gradients was measured against each section's solid base colour (the gradients are within a few percent of it). Text inside the cover artwork is not part of the page.
- **External retailer flow:** the Google Play page loads (HTTP 200). The "Free sample" button on Google's side was not clicked through.
- **Performance:** no Lighthouse or network-throttled run. The page weight is small (HTML/CSS/JS ~61 KB uncompressed; cover 148 KB at 1×, 527 KB at 2×) plus Google Fonts.
- **HTML validator:** not run against the W3C service (that would send the file to an external site).
- **Fonts** come from Google Fonts (a third-party request). They should be self-hosted before any public use (see `research/MISSING_ITEMS_LOG.md` #19).
