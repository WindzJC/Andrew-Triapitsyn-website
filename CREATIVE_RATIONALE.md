# Creative rationale: Andrew Triapitsyn, author homepage concept

**Status:** a complimentary local draft for JC's review. Not deployed, not sent, not approved by the author.

## The idea: a house, and rooms for each book
Andrew is building a catalogue across fiction **and** nonfiction, but only one book is public. A site dressed entirely in that book's gilded, engraved look would make him read as a one-title, one-genre author.

So the concept splits the identity in two:

- **The house (the author):** paper and ink. Warm parchment, near-black type, one oxblood accent, Cormorant Garamond display type and a typographic "AT" monogram. It is neutral enough to hold a thriller series and a nonfiction series side by side.
- **The rooms (each book):** a book brings its own palette when it is featured. *Immunity to Illusions* gets night-black, bronze and antique gold, which echoes its cover and the companion site without copying the companion's artwork. A future series can get its own room without the house changing.

## Reader journey (7 sections)
1. **Hero:** his name at full scale, "Author · Fiction & Nonfiction", a one-line description drawn from his own bio, and the book shown as the *featured* title in its own dark panel. On phones that panel becomes a compact card, so author and book both appear on the first screen.
2. **The Author:** his published bio, plus one truthful line saying several fiction and nonfiction series are in development.
3. **The Writing:** two numbered shelves, *I Nonfiction* and *II Fiction*, laid out as a library catalogue rather than a product grid. Only published work is listed. The fiction shelf says plainly that no titles have been announced.
4. **Featured book:** the cover at full fidelity, the full title, an exact one-line quote, a short paraphrased synopsis, and verified facts (13 chapters, 786 pages on Google Play, 70 illustrations, Capture Audit, ISBN).
5. **Inside the book:** six subjects paraphrased from his description, clearly labelled as subjects rather than chapter titles. Then the one interaction, **Inspect the frame**: five nested frames (Surface, Design, Incentive, Language, Yourself), each paired with a question a reader can ask. It shows the book's method, not its content, and is labelled as an interpretation.
6. **From argument to evidence:** points readers to illusionsbook.com as the authority for sources: 50 numbered sources, 31 films and series, browsable by chapter. It complements the companion and does not copy it.
7. **Continue reading:** four plain paths: free sample, buy, check sources, write to Andrew.

## Scalability
- Adding a book means copying one `<li class="book">`. Adding a series means one `<article class="series">` (the pattern is documented in an HTML comment and in `PREVIEW.md`). The layout needs no redesign.
- This was tested, not assumed: the QA script injects three sample series with nine sample books, and the layout holds at 1440 and 390 px. See `qa/screenshots/scalability-test-*-INTERNAL-SAMPLE-DATA.png`. That sample data exists only in the test, never in `site/`.
- If a series later becomes the lead project, the featured "room" can be swapped to that book. The house styling stays the same.

## Honesty guardrails
No invented titles, covers, quotes, reviews, credentials, portraits or "coming soon" buttons. Astra-written lines ("Examine the claims…", the diagram questions) are never attributed to Andrew. A banner on every view says "Design concept for private review · Not an official website".

## Motion and accessibility
- Motion is limited to a soft rise-and-fade as sections enter the screen, plus the cover settling in on load. All of it is turned off under reduced-motion settings.
- The interaction uses native radio buttons. They work with arrow keys, need no JavaScript (CSS `:has()`), and a script fallback covers browsers without `:has()`.
