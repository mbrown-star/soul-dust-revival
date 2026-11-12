# Soul Dust Revival: Interactive Editions

Phone-first interactive web editions of Soul Dust Revival books (MarketLife Ministries / Bible Studies, Inc., written by The Soul Dust Team). Each edition is generated from the book's typeset PDF, so the interactive text always matches the printed book.

Read HANDOFF.md first. It covers what exists, why it's built this way, the known gaps and the suggested next steps.

## Commands
```
pip install -r requirements.txt     # pdfplumber
./build.sh                          # rebuild everything in dist/ from source/
```
Open `dist/colossians.html` or `dist/psalms-365.html` directly in a browser. No server and no build tooling are needed.

## Layout
- `source/` holds the book PDFs. They are the source of truth. Never edit text in `data/` or `dist/` by hand; fix the parser or the PDF instead.
- `data/` holds the parsed JSON (`colossians-weeks.json`, `psalms-365-days.json`) and the WEB Bible JSON for Colossians and Psalms (`data/web/`), from the `world-english-bible` npm package v1.0.1.
- `tools/study/` handles 12-week studies (Colossians layout): `parse_study.py` turns the PDF into weeks JSON, `build_study.py` turns that JSON plus the WEB into HTML, and `study_template.html` is the page design.
- `tools/study/parse_five_stations.py` (2026-11-12) parses every "Five Stations" study (Colossians, 1 Peter, 1 Timothy, Ephesians, Galatians, Philippians, James, John Parts 1–4, In Christ, Benedictions, both Genesis parts) straight into the enriched weeks JSON the web app loads (`scripts/backfill-study-content.ts`). It goes by section labels and sizes relative to each book's body text (the titles are set in two type sizes), reads each passage from the manuscript's own superscript verse numbers (no outside Bible text), checks every week, and exits non-zero on any warning. Its Colossians output is identical to `colossians-weeks-enriched.json`. Output lives in `data/weeks/<study-slug>.json`. It also reads the Journey's Parts One to Three (no printed passage, small-capitals section headings and Part sub-headings, commentary before each question, questions with no word study, word studies printed away from their station and matched by cross-reference, capstone closing essays, Extra Practical boxes), and puts Hebrew back in reading order (the PDF gives it right to left, letter by letter). Since 2026-11-12 it also reads the six "Passage Walk" books (Hebrews, Romans, Sermon on the Mount, Ecclesiastes, Law and Gospel, Journey Part Four): passage under THE WORD, 7–12 stations, cross-references in ordinary case, a transliteration set on the word's own line, Part headings barely larger than the body, and a word study whose verse no station covers kept with the station it's printed under. And the four "Gathered Passages" books (Prayer, The Gospel, The Holy Spirit, The Ten Commandments): passages from several places read part by part (each part's first verse carries `ref`; anchors name their `part`), the key verse taken from the verse that opens the study when the opener prints only ANCHOR, MY ANSWER labels skipped, Prayer's type settings, and control characters dropped. A gloss that wraps onto plain lines now runs on to its cross-references in every book (this repaired 32 word studies in 1 Peter, Galatians and Philippians).
- `tools/devotional/` handles the 365-day devotional: `parse_devotional.py`, `build_devotional.py` and `devotional_template.html`.
- `dist/` holds the generated pages. `dist/*.html` are full HTML documents. `dist/artifact/*.html` have no doctype, html, head or body tags; that's the format for publishing as a Claude artifact.
- `prototypes/` holds the earlier hand-built pages, kept for reference only. They are artifact format (no doctype), so open them by publishing or wrap them first.

## Content rules (non-negotiable)
- Use the manuscript text exactly. Do not rewrite, shorten, summarize or "improve" any study text, question, word study, prayer or benediction.
- Scripture is the World English Bible (WEB). The one exception is Psalm 119:25, which is quoted from the NKJV and always labeled "(NKJV)".
- Voice: pastoral, Christ-centered, Reformed (never labeled as such), written for men in the studies and for anyone in the Universal Edition devotional. Theme: from dust to revival (Psalm 119:25).
- Keep the book's section labels exactly as printed: SCRIPTURE STUDY · DIVE, QUESTION, GOING DEEPER · THE GREEK, LIVE IT, LIFE APPLICATION, DAILY PRAYER, BOTTOM LINE, Lift Up Your Eyes, QUIET QUESTION TO CARRY, A Question to Sit With, READ · REFLECT · RETURN.
- Devotional preface rule, kept on purpose in the UI: "If you miss a day, do not go back and hurry to catch up. Pick up with today." Never show streaks, never count missed days, and never use guilt-based nudges.

## Design rules
- Series palette: gold #AD9A5F, olive #6B7338, cream box #EFE6C2, body text #2B2B2B. Each book takes its accent color from its cover (Colossians: #B4531F light, #E07F48 dark).
- Fonts (Google Fonts): Archivo Black for display, Archivo for labels and UI, Source Serif 4 for body text, Gentium Book Plus for polytonic Greek.
- Must work at about 400px phone width, in both light and dark mode. Every color is a CSS variable on `:root`, redefined for dark mode.
- Pages are single self-contained HTML files with inline CSS and JS. The only external requests are to Google Fonts.
- Saved state uses localStorage with a separate prefix per book (`sdr-colossians-`, `sdr-ps365-`), and every read and write is wrapped in try/catch.

## Working conventions
- After changing a parser, run `./build.sh` and check the summary lines. Every study week should show 2 sections, 4 parts, 5 stations, 5 practices and 3 benediction paragraphs. The devotional should show 365 days, 4 paragraphs per day, and no days missing a part.
- The parsers rely on the PDF's font sizes and weights (see `kind()` in parse_study.py). If a new volume was typeset differently, adjust those rules and keep the old ones working.
