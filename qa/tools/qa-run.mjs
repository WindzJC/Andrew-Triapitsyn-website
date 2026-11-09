// Local QA runner: drives headless Chrome over the DevTools Protocol (no npm installs).
// Usage:  node qa/tools/qa-run.mjs        (run from the project root)
// Output: qa/screenshots/*.png and qa/qa-results.json
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(process.argv[2] || ".");
const SITE = pathToFileURL(join(ROOT, "site", "index.html")).href;
const SHOTS = join(ROOT, "qa", "screenshots");
mkdirSync(SHOTS, { recursive: true });

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const profile = join(tmpdir(), "astra-qa-chrome-" + Date.now());
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--remote-debugging-address=127.0.0.1",
  `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
  "--disable-extensions", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForChrome() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return; } catch {}
    await sleep(250);
  }
  throw new Error("Chrome did not start");
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.listeners = [];
    this.ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.pending.has(d.id)) {
        const { res, rej } = this.pending.get(d.id); this.pending.delete(d.id);
        d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result);
      } else if (d.method) this.listeners.forEach((fn) => fn(d));
    };
  }
  open() { return new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; }); }
  send(method, params = {}) {
    const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  on(fn) { this.listeners.push(fn); }
  once(method, timeout = 20000) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error("timeout " + method)), timeout);
      const fn = (d) => { if (d.method === method) { clearTimeout(t); this.listeners = this.listeners.filter((f) => f !== fn); res(d.params); } };
      this.on(fn);
    });
  }
  async ev(expression) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900, mobile: false },
  { name: "desktop-1024", width: 1024, height: 768, mobile: false },
  { name: "mobile-390", width: 390, height: 844, mobile: true },
  { name: "mobile-320", width: 320, height: 640, mobile: true },
];

// ---------- In-page check functions (serialised into the page) ----------
const PAGE_CHECKS = String.raw`(() => {
  const vw = document.documentElement.clientWidth;
  const out = {};
  out.scrollWidth = document.documentElement.scrollWidth; out.clientWidth = vw;
  out.overflowX = document.documentElement.scrollWidth > vw;
  out.overflowing = [...document.querySelectorAll("body *")].filter(el => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (!r.width || cs.visibility === "hidden" || cs.display === "none") return false;
    if (el.closest(".hero__feature, .book-room, .visually-hidden, .skip-link")) return false; // clipped containers (overflow:hidden)
    return r.right > vw + 1 || r.left < -1;
  }).slice(0, 15).map(el => el.tagName.toLowerCase() + "." + [...el.classList].join(".") + " right=" + Math.round(el.getBoundingClientRect().right));

  // Images & cover fidelity
  out.images = [...document.images].map(img => {
    const r = img.getBoundingClientRect();
    const natural = img.naturalWidth / img.naturalHeight; const shown = r.width / r.height;
    return { src: (img.currentSrc || img.src).split("/").pop(), complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
      renderedW: Math.round(r.width), renderedH: Math.round(r.height), ratioDelta: +(Math.abs(natural - shown)).toFixed(4),
      objectFit: getComputedStyle(img).objectFit, alt: img.getAttribute("alt"),
      pixelsPerCssPx: r.width ? +(img.naturalWidth / r.width).toFixed(2) : null };
  });

  // Fonts
  out.fonts = { display: document.fonts.check('500 32px "Cormorant Garamond"'), sans: document.fonts.check('400 16px "IBM Plex Sans"'), mono: document.fonts.check('400 12px "IBM Plex Mono"') };

  // Tap targets
  const targets = [...document.querySelectorAll("a, button, .inspect__controls label")].filter(el => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !el.classList.contains("skip-link") && !el.closest(".visually-hidden");
  });
  out.tapTargets = { checked: targets.length, under44: [], under24: [] };
  targets.forEach(el => {
    const r = el.getBoundingClientRect();
    const label = (el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const rec = label + " (" + Math.round(r.width) + "x" + Math.round(r.height) + ")";
    if (r.width < 24 || r.height < 24) out.tapTargets.under24.push(rec);
    else if (r.width < 44 || r.height < 44) out.tapTargets.under44.push(rec);
  });

  // Contrast (text over solid composited backgrounds)
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const bgOf = el => { const layers = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
    let base = [255, 255, 255]; for (let i = layers.length - 1; i >= 0; i--) { const { rgb, a } = layers[i]; base = base.map((v, k) => rgb[k] * a + v * (1 - a)); } return base; };
  const fails = []; let checked = 0; let minRatio = 99, minSample = "";
  document.querySelectorAll("body *").forEach(el => {
    if (el.closest("svg, .visually-hidden, .skip-link")) return;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) return;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden") return;
    const fg = parse(cs.color); const bg = bgOf(el);
    const f = fg.rgb.map((v, k) => v * fg.a + bg[k] * (1 - fg.a));
    const L1 = lum(f), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66); const need = large ? 3 : 4.5;
    checked++;
    const sample = el.tagName.toLowerCase() + "." + [...el.classList].join(".") + ' "' + el.textContent.trim().slice(0, 30) + '"';
    if (ratio < minRatio) { minRatio = ratio; minSample = sample + " " + ratio.toFixed(2); }
    if (ratio < need) fails.push(sample + " ratio " + ratio.toFixed(2) + " need " + need);
  });
  out.contrast = { checked, failures: fails.slice(0, 20), lowest: minSample };

  // Landmarks & headings
  out.landmarks = { header: !!document.querySelector("header.site-header"), nav: document.querySelectorAll("nav").length, main: document.querySelectorAll("main").length, footer: !!document.querySelector("footer.site-footer") };
  out.headings = [...document.querySelectorAll("h1,h2,h3")].map(h => h.tagName + ": " + h.textContent.trim().replace(/\s+/g, " ").slice(0, 60));
  out.missingAlt = [...document.images].filter(i => !i.hasAttribute("alt")).length;
  out.pageHeight = document.documentElement.scrollHeight;
  return out;
})()`;

const SCROLL_THROUGH = `(async () => { const H = document.documentElement.scrollHeight;
  for (let y = 0; y < H; y += Math.round(innerHeight * 0.5)) { window.scrollTo({ top: y, behavior: "instant" }); await new Promise(r => setTimeout(r, 110)); }
  window.scrollTo({ top: 0, behavior: "instant" }); await new Promise(r => setTimeout(r, 1500)); return document.documentElement.scrollHeight; })()`;

async function main() {
  await waitForChrome();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const cdp = new CDP(target.webSocketDebuggerUrl); await cdp.open();
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Log.enable");

  const consoleLog = [];
  cdp.on((d) => {
    if (d.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(d.params.type))
      consoleLog.push(`${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    if (d.method === "Runtime.exceptionThrown") consoleLog.push("exception: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    if (d.method === "Log.entryAdded" && ["error", "warning"].includes(d.params.entry.level))
      consoleLog.push(`log-${d.params.entry.level}: ${d.params.entry.text} ${d.params.entry.url || ""}`);
  });

  const results = { url: SITE, runAt: new Date().toISOString(), chrome: (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).Browser, viewports: {}, tests: {} };

  async function load(vp, extra = {}) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });
    await cdp.send("Emulation.setTouchEmulationEnabled", vp.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: extra.reduced ? "reduce" : "no-preference" }] });
    await cdp.send("Emulation.setScriptExecutionDisabled", { value: !!extra.noJs });
    const loaded = cdp.once("Page.loadEventFired");
    await cdp.send("Page.navigate", { url: SITE + (extra.hash || "") });
    await loaded;
    await cdp.ev("document.fonts.ready.then(() => true)").catch(() => {});
    await sleep(extra.wait ?? 1700);
  }
  async function shot(file, full) {
    let params = { format: "png" };
    if (full) {
      const h = await cdp.ev("document.documentElement.scrollHeight");
      const w = await cdp.ev("document.documentElement.clientWidth");
      params = { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } };
    }
    const { data } = await cdp.send("Page.captureScreenshot", params);
    writeFileSync(join(SHOTS, file), Buffer.from(data, "base64"));
    return file;
  }
  async function key(k, code, keyCode, modifiers = 0) {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: keyCode, modifiers });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: keyCode, modifiers });
  }
  async function clickSel(sel) {
    const box = await cdp.ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.scrollIntoView({block:"center", behavior:"instant"}); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await sleep(150);
    for (const type of ["mousePressed", "mouseReleased"]) await cdp.send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
    await sleep(350);
  }

  // ---------- Per-viewport renders and checks ----------
  for (const vp of VIEWPORTS) {
    consoleLog.length = 0;
    await load(vp);
    const first = await shot(`${vp.name}-first-viewport.png`, false);
    await cdp.ev(SCROLL_THROUGH);
    const full = await shot(`${vp.name}-full-page.png`, true);
    const checks = await cdp.ev(PAGE_CHECKS);
    // What is visible in the first viewport?
    checks.firstViewport = await cdp.ev(`(() => { const vis = s => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && r.width > 0; };
      return { authorName: vis(".hero__title"), fictionNonfictionEyebrow: vis(".hero .eyebrow"), lede: vis(".hero__lede"), primaryAction: vis(".hero__actions .btn"), featuredCover: vis(".hero__feature .cover img"), headerNav: vis(".site-nav__list") || vis(".site-nav__toggle") }; })()`);
    // Section-level viewport captures (what a reader actually sees when they arrive at each section)
    const sectionShots = [];
    for (const id of ["writing", "featured", "inspect", "sources"]) {
      if (!["desktop-1440", "mobile-390"].includes(vp.name)) break;
      await cdp.ev(`(() => { const el = document.getElementById("${id}"); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 80, behavior: "instant" }); return true; })()`);
      await sleep(900);
      sectionShots.push(await shot(`${vp.name}-section-${id}.png`, false));
    }
    await cdp.ev('window.scrollTo({ top: 0, behavior: "instant" })');
    results.viewports[vp.name] = { ...checks, screenshots: [first, full, ...sectionShots], console: [...consoleLog] };
    console.log(vp.name, "overflowX:", checks.overflowX, "console:", consoleLog.length, "contrast fails:", checks.contrast.failures.length);
  }

  // ---------- Interaction: Inspect the frame (mouse + keyboard) ----------
  {
    const vp = VIEWPORTS[0]; consoleLog.length = 0; await load(vp);
    await cdp.ev(SCROLL_THROUGH);
    const state = () => cdp.ev(`(() => { const st = document.querySelector(".inspect__stage"); const v = st.querySelector("input:checked").value;
      const shown = [...st.querySelectorAll(".caption")].filter(c => getComputedStyle(c).display !== "none").map(c => c.className);
      const active = [...st.querySelectorAll(".ring")].map(g => getComputedStyle(g).opacity);
      return { checked: v, dataLayer: st.dataset.layer, captionsShown: shown, ringOpacities: active, focused: document.activeElement && document.activeElement.value }; })()`);
    const t = { initial: await state() };
    await clickSel('.inspect__controls label:nth-of-type(3) span');
    t.afterClickLayer3 = await state();
    await shot("interaction-inspect-layer3-desktop.png", false);
    await key("ArrowRight", "ArrowRight", 39);
    await sleep(400);
    t.afterArrowRight = await state();
    await key("ArrowRight", "ArrowRight", 39); await sleep(400);
    t.afterArrowRight2 = await state();
    await shot("interaction-inspect-layer5-desktop.png", false);
    t.pass = t.initial.checked === "1" && t.afterClickLayer3.checked === "3" && t.afterClickLayer3.captionsShown.length === 1 && t.afterClickLayer3.captionsShown[0].includes("caption--3")
      && t.afterArrowRight.checked === "4" && t.afterArrowRight2.checked === "5" && t.afterArrowRight2.captionsShown[0].includes("caption--5");
    t.console = [...consoleLog];
    results.tests.inspectInteraction = t;
  }

  // ---------- Keyboard: tab order + visible focus (desktop) ----------
  {
    const vp = VIEWPORTS[0]; await load(vp);
    const stops = [];
    for (let i = 0; i < 26; i++) {
      await key("Tab", "Tab", 9); await sleep(60);
      stops.push(await cdp.ev(`(() => { const el = document.activeElement; if (!el || el === document.body) return null;
        const target = el.matches('input[type=radio]') ? el.nextElementSibling : el; const cs = getComputedStyle(target);
        const label = (el.getAttribute("aria-label") || el.textContent || el.value || "").trim().replace(/\\s+/g, " ").slice(0, 44);
        return { tag: el.tagName.toLowerCase(), label, outline: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor, visibleFocus: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 1 }; })()`));
    }
    results.tests.keyboard = { stops, allFocusVisible: stops.filter(Boolean).every((s) => s.visibleFocus) };
    await key("Tab", "Tab", 9, 0);
    // Skip link activation
    await load(vp); await key("Tab", "Tab", 9); await sleep(80);
    await shot("keyboard-skip-link-desktop.png", false);
    results.tests.keyboard.firstStop = await cdp.ev("document.activeElement.className + ' | ' + document.activeElement.textContent.trim()");
    await key("Enter", "Enter", 13); await sleep(400);
    results.tests.keyboard.afterSkipEnter = await cdp.ev("document.activeElement.id || document.activeElement.tagName");
  }

  // ---------- Mobile menu ----------
  {
    const vp = VIEWPORTS[2]; await load(vp);
    const m = {};
    const vis = () => cdp.ev(`(() => { const l = document.querySelector("[data-nav-list]"); const t = document.querySelector("[data-nav-toggle]"); return { listDisplay: getComputedStyle(l).display, expanded: t.getAttribute("aria-expanded"), focused: document.activeElement === t }; })()`);
    m.initial = await vis();
    await clickSel("[data-nav-toggle]");
    m.afterOpen = await vis();
    await shot("mobile-390-menu-open.png", false);
    await key("Escape", "Escape", 27); await sleep(200);
    m.afterEscape = await vis();
    await clickSel("[data-nav-toggle]");
    await clickSel('[data-nav-list] a[href="#sources"]'); await sleep(900);
    m.afterLinkClick = await vis();
    m.hashAfterNav = await cdp.ev("location.hash");
    m.sourcesTop = await cdp.ev('Math.round(document.getElementById("sources").getBoundingClientRect().top)');
    m.pass = m.initial.listDisplay === "none" && m.afterOpen.listDisplay !== "none" && m.afterOpen.expanded === "true" && m.afterEscape.listDisplay === "none" && m.afterEscape.focused && m.afterLinkClick.listDisplay === "none" && m.hashAfterNav === "#sources";
    results.tests.mobileMenu = m;
  }

  // ---------- Reduced motion ----------
  {
    const vp = VIEWPORTS[2]; await load(vp, { reduced: true, wait: 300 });
    results.tests.reducedMotion = await cdp.ev(`(() => { const r = [...document.querySelectorAll(".reveal")]; const hidden = r.filter(el => getComputedStyle(el).opacity !== "1").length;
      const td = getComputedStyle(document.querySelector(".reveal")).transitionDuration; const sb = getComputedStyle(document.documentElement).scrollBehavior;
      return { revealCount: r.length, hiddenAtLoad: hidden, transitionDuration: td, scrollBehavior: sb, pass: hidden === 0 && sb === "auto" }; })()`);
    await shot("mobile-390-reduced-motion-first-viewport.png", false);
  }

  // ---------- No JavaScript ----------
  {
    const vp = VIEWPORTS[2]; await load(vp, { noJs: true, wait: 800 });
    const nj = await cdp.ev(`(() => { const r = [...document.querySelectorAll(".reveal")].filter(el => getComputedStyle(el).opacity !== "1").length;
      const navShown = getComputedStyle(document.querySelector("[data-nav-list]")).display !== "none";
      return { hiddenReveals: r, navLinksVisible: navShown, hasJsClass: document.documentElement.classList.contains("js") }; })()`);
    await shot("mobile-390-no-js-first-viewport.png", false);
    await cdp.send("Emulation.setScriptExecutionDisabled", { value: false });
    nj.pass = nj.hiddenReveals === 0 && nj.navLinksVisible && !nj.hasJsClass;
    results.tests.noJs = nj;
  }

  // ---------- Scalability test (internal only: injects obviously fake sample series; never part of the site) ----------
  for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
    await load(vp); await cdp.ev(SCROLL_THROUGH);
    const after = await cdp.ev(String.raw`(() => {
      const mk = (name, n) => { const a = document.createElement("article"); a.className = "series";
        a.innerHTML = '<header class="series__head"><span class="series__label mono">Series</span><h4 class="series__title">' + name + '</h4><span class="series__count mono">' + n + ' books</span></header><ol class="series__books"></ol>';
        const ol = a.querySelector("ol");
        for (let i = 1; i <= n; i++) ol.insertAdjacentHTML("beforeend", '<li class="book"><a class="book__link" href="#writing"><span class="book__thumb" style="display:block;background:repeating-linear-gradient(45deg,#ccc,#ccc 4px,#ddd 4px,#ddd 8px)"></span><span class="book__body"><span class="book__status mono">QA SAMPLE DATA · NOT REAL</span><span class="book__title"><cite>Sample Book ' + i + '</cite></span><span class="book__meta mono">Book ' + i + ' of ' + n + '</span></span><span class="book__arrow">→</span></a></li>');
        return a; };
      const nf = document.querySelector('[aria-labelledby="shelf-nonfiction"]');
      nf.insertBefore(mk("SAMPLE NONFICTION SERIES A (QA test)", 3), nf.querySelector(".shelf__note"));
      const fic = document.querySelector('[aria-labelledby="shelf-fiction"]');
      fic.classList.remove("shelf--empty"); fic.querySelector(".shelf__note").remove();
      fic.appendChild(mk("SAMPLE FICTION SERIES B (QA test)", 4)); fic.appendChild(mk("SAMPLE FICTION SERIES C (QA test)", 2));
      document.getElementById("writing").scrollIntoView({ behavior: "instant" });
      return { overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth, writingHeight: Math.round(document.getElementById("writing").getBoundingClientRect().height) };
    })()`);
    await sleep(300);
    const clip = await cdp.ev(`(() => { const r = document.getElementById("writing").getBoundingClientRect(); return { x: 0, y: Math.round(r.top + scrollY), width: document.documentElement.clientWidth, height: Math.round(r.height), scale: 1 }; })()`);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip });
    const f = `scalability-test-${vp.name}-INTERNAL-SAMPLE-DATA.png`;
    writeFileSync(join(SHOTS, f), Buffer.from(data, "base64"));
    results.tests["scalability_" + vp.name] = { ...after, screenshot: f, pass: !after.overflowX };
  }

  // ---------- Links ----------
  {
    await load(VIEWPORTS[0]);
    const links = await cdp.ev(`[...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href"))`);
    const unique = [...new Set(links)];
    const report = [];
    for (const href of unique) {
      if (href.startsWith("#")) {
        const ok = href === "#" ? false : await cdp.ev(`!!document.getElementById(${JSON.stringify(href.slice(1))})`);
        report.push({ href, type: "anchor", ok });
      } else if (href.startsWith("mailto:")) {
        report.push({ href, type: "mailto", ok: /^mailto:[^@\s]+@[^@\s]+\.[a-z]+$/i.test(href), note: "syntax only; address matches the one published on illusionsbook.com" });
      } else if (/^https?:/.test(href)) {
        try {
          const r = await fetch(href, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (local QA link check)" } });
          const body = await r.text();
          report.push({ href, type: "external", status: r.status, ok: r.ok, finalUrl: r.url, titleSnippet: (body.match(/<title>([^<]*)<\/title>/i) || [])[1]?.slice(0, 120) });
        } catch (e) { report.push({ href, type: "external", ok: false, error: String(e) }); }
      } else {
        report.push({ href, type: "relative", ok: null });
      }
    }
    const targetBlank = await cdp.ev(`[...document.querySelectorAll('a[target=_blank]')].every(a => /noopener/.test(a.rel))`);
    results.tests.links = { count: links.length, unique: report, allOk: report.every((r) => r.ok), targetBlankHaveNoopener: targetBlank };
  }

  writeFileSync(join(ROOT, "qa", "qa-results.json"), JSON.stringify(results, null, 2));
  console.log("done");
  cdp.ws.close();
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => {
  chrome.kill();
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 800);
});
