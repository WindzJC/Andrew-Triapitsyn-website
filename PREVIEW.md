# Local preview: Andrew Triapitsyn concept

The site is plain HTML, CSS and JS in `site/` with no build step. Fonts load from Google Fonts, so you need an internet connection for the intended typography.

## Preview (one method)
In PowerShell, from this folder (`D:\Astra Productions\Author Websites\Andrew Triapitsyn`):

```powershell
python -m http.server 8080 --bind 127.0.0.1 --directory site
```

Then open http://127.0.0.1:8080/ in a browser, and press Ctrl+C in PowerShell to stop. The server is bound to 127.0.0.1, so it is not reachable from other devices.

(Double-clicking `site\index.html` also works, but the server matches how a hosted page behaves.)

## Re-run QA
```powershell
node qa/tools/qa-run.mjs .
```
This needs Chrome at the default install path (or set `$env:CHROME`). It rewrites `qa/screenshots/*.png` and `qa/qa-results.json`. It uses headless Chrome on 127.0.0.1 with a temporary profile, and needs no npm installs.

## Adding a verified book or series later
In `site/index.html`, inside the right shelf (`#shelf-nonfiction` or `#shelf-fiction` section):

```html
<article class="series">
  <header class="series__head">
    <span class="series__label mono">Series</span>
    <h4 class="series__title">Series name</h4>
    <span class="series__count mono">2 books</span>
  </header>
  <ol class="series__books">
    <li class="book">
      <a class="book__link" href="LINK">
        <img class="book__thumb" src="assets/img/COVER.jpg" width="539" height="862" alt="" loading="lazy">
        <span class="book__body">
          <span class="book__status mono">Published · Month Year</span>
          <span class="book__title"><cite>Title</cite></span>
          <span class="book__sub">Subtitle</span>
          <span class="book__meta mono">Format · details</span>
        </span>
        <span class="book__arrow" aria-hidden="true">→</span>
      </a>
    </li>
  </ol>
</article>
```

When the fiction shelf gets its first title, remove its `shelf--empty` class and its "in development" note, and update `.shelf__count` on both shelves.
