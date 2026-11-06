# Handoff: Soul Dust Revival Interactive Editions

Prepared November 6, 2026, for continuing the work in Claude Code.

## 1. What exists

Two working interactive editions, each generated end to end from the book PDF by `./build.sh`:

| Edition | Source PDF | Output | Status |
|---|---|---|---|
| Colossians, 12-week study | `source/Soul_Dust_Revival_Colossians_WEB_version.pdf` | `dist/colossians.html` (283 KB) | All 12 weeks parse cleanly |
| Psalms, 365-day devotional (Universal Edition) | `source/Soul_Dust_Revival_Psalms_365_Universal_WEB_version.pdf` | `dist/psalms-365.html` (1.1 MB) | All 365 days parse cleanly |

Live previews (private Claude artifacts; share from their Share menu):
- Colossians, all 12 weeks: https://claude.ai/artifact/RT4cRAqX58mBV2SCNTtHRL
- Psalms 365: https://claude.ai/artifact/85cayipaReLxmPCmWfH1Nt
- Philippians Week 1 format test, with sample copy (not manuscript text): https://claude.ai/artifact/1eKvKHupVPwfcUSpVpuEpa

## 2. The 12-week study edition (Colossians layout)

### How the book maps to the screen
Five tabs follow the printed order of each week. A progress ring fills as each tab is marked done.

| Tab | Printed section | Interaction |
|---|---|---|
| Study | Week opener + SCRIPTURE STUDY · DIVE | Key verse card with Psalm 119:25 and READ · REFLECT · RETURN. The two intro sections are shown in full; Parts One–Four open one at a time and get checked off when read. Pull quotes appear where they fall in the text. |
| Passage | THE PASSAGE (WEB) | Full passage. The English word behind each Greek study is underlined and opens it in a bottom sheet, which also links to that verse's question. Verse-by-verse read-aloud. A memorization slider on the week's key verse. |
| Work the Word | THE WORD ON … / five verse stations | One station at a time: verse, then QUESTION with an answer box, then "Open the Greek" (GOING DEEPER · THE GREEK + LIVE IT). The order follows the book's instruction to let the verse land and answer first. The tab completes itself once all five stations are answered and opened. |
| Live It | LIFE APPLICATION, DAILY PRAYER, BOTTOM LINE | The five practices as a weekly checklist. The daily prayer becomes a 5-minute guided timer that steps through the Father / Son / Spirit lines, which are parsed from the prayer text. |
| Lift Up | BENEDICTION, closing verse, QUIET QUESTION TO CARRY | The benediction and the carry question on a dark card. |

A week picker in the header switches between all 12 weeks. Each week keeps its own answers and progress. URLs use the form `#week-3-work`.

### Pipeline
1. `parse_study.py` reads every text line with pdfplumber and classifies it by font size, weight and style (`kind()`): 23pt bold is the week title, 19pt is a section title, 12.5 bold is an intro subhead, 7pt bold "PART …" is a part heading, 12.5 bold-italic is a pull quote, 15pt bold is the Greek word, "LIVE IT:" lines, and so on. Paragraphs come from vertical gaps. A paragraph that crosses a page continues unless the last line ends short with closing punctuation.
2. `build_study.py`:
   - adds the WEB passage text for each week's reference (the PDF's passage page isn't used because its verse numbers are superscripts);
   - picks the English word to underline for each Greek study (`find_anchor()` matches words from the gloss against words in the station's verses);
   - splits the prayer into its three parts;
   - fills `study_template.html`.

### weeks.json schema (one record per week)
```
week, title, subtitle, keyVerse, keyRef,
study: { sections: [{heading, paras[], pulls?[]}], parts: [{label, heading, paras[], pulls?[]}] },
passageRef, stationsLabel, stationsIntro,
stations: [{ref, verse, question, greek, translit, gloss, xref, body[], live}],
lifeTitle, lifeIntro, practices: [{n, title, body}], prayer, bottomLine[],
benediction[], closingVerse, closingRef, carry
build adds: passage[{c,n,text}], stations[].verseNums, stations[].anchor{v,word}, prayerLead, prayerBeats[{person,verb,words}], prayerClose
```

## 3. The 365-day devotional edition

### How the book maps to the screen
- **Today** opens on the reader's actual date (Jan 1 is Day 1; Feb 29 shows Day 59). It's one scrolling page in the printed order: key verse, four reading paragraphs, Lift Up Your Eyes, and A Question to Sit With with an answer box. It also has:
  - "Read Psalm N:a–b", which opens the WEB text, with "Show all of Psalm N";
  - read-aloud of the whole day;
  - a hide-words slider on the key verse.
- **Missed days follow the book's preface.** On an earlier, unfinished day the page shows "No need to hurry to catch up" and a **Pick up with today** button. There are no streaks; the progress ring counts days walked.
- **The Year** tab shows a 12-month grid of 365 days, marking days walked, today and days with answers. Each month lists the psalm range it covers. It shows counts for days walked, psalms covered (out of 150) and answers written, and has a search box (a psalm number, or any word in a title, key verse or question).
- **Journal** lists every answer, newest first; tapping one opens that day.
- **Six Faces of the Dust** is the book's front-matter section (I–VI plus VII, The Christ-Centered Lens). It's hard-coded in `devotional_template.html` because it appears once.

### Pipeline
`parse_devotional.py` splits the book at `DAY n · MONTH D · PSALM ref` headers. A paragraph break is a vertical gap over 14.5pt. Lines that run full width continue across pages. `build_devotional.py` embeds the days plus all 150 WEB psalms into `devotional_template.html`.

### days.json schema
`d` day number, `dt` date ("November 6"), `r` psalm reference ("Psalm 119 (vv. 161–168)"), `t` title, `kv` key verse, `kr` key verse reference, `p` four reading paragraphs, `l` Lift Up Your Eyes, `q` question.

## 4. Known gaps and limits

1. **Saved state is per browser.** Answers and progress live in localStorage only. They don't sync between phone and computer and can't be seen by a group leader. This is the biggest functional gap.
2. **Greek underlines.** About 1 in 5 Greek studies has no clear English match in the passage (for example ὀφθαλμοδουλία, eye-service, in Colossians 3:22). Those show as buttons under the passage instead of underlines. Fix this with a manual override map rather than more guessing.
3. **Hebrew notes in the devotional** (for example "shatal" on Day 1) are plain text inside the readings. The PDF doesn't mark them, so they can't be tapped.
4. **Italics in body text are lost.** Scripture quoted inside study paragraphs is plain text. Italic runs could be recovered from the PDF's character fonts if wanted.
5. **Hand-built extras aren't in the generated version.** The Week 1 prototype had tappable faith, love and hope buttons (`prototypes/colossians-week1-handbuilt.artifact.html`).
6. **One study layout tested.** `parse_study.py` has only been run on Colossians. Other 12-week volumes (Philippians, Parables, Law and Gospel and others) may have been typeset with different sizes, fonts or section labels.
7. **Read-aloud** uses the device's built-in voice (speechSynthesis), so quality varies by phone.
8. **Fonts load from Google Fonts**, so offline use needs them bundled locally.

## 5. Suggested next steps for the build (in order)

1. **One app shell.** A library home screen lists every book (studies and devotionals), shows progress and resumes where the reader left off. The two templates share a CSS token file and common components (bottom sheet, progress ring, answer box, read-aloud).
2. **Installable and offline.** A web app manifest, a service worker, local fonts and per-book data files, so a man can add it to his home screen and read without signal.
3. **Accounts and sync.** Sign-in plus a small backend storing answers, progress and checklists, so readers can move between devices. Then optional group features: a leader sees who walked this week, and members can choose to share an answer with their group. Decide on privacy defaults before building; answers are personal.
4. **Generalize the study parser.** Run `parse_study.py` on each 12-week PDF, add layout variants as needed, and add a per-book config file (title, accent colors, storage prefix, anchor overrides).
5. **Anchor overrides.** A `data/<book>-anchors.json` file mapping a station to the exact verse and word to underline, checked before `find_anchor()`.
6. **Regression checks.** A test that runs `build.sh` and verifies the counts (weeks, stations, days, paragraphs), plus a headless-browser check for JavaScript errors and horizontal overflow at 400px width.
7. **Optional richer content:** keep italic runs, link cross-references (e.g. "EPHESIANS 2:8") to WEB pop-ups, and add audio recorded by the team in place of the device voice.

## 6. Decisions already made (don't revisit without asking)
- Text comes from the typeset PDFs, not retyped, so the interactive edition matches the printed book.
- The WEB is the only Scripture, apart from Psalm 119:25 in the NKJV.
- In the studies, the Greek opens after the reader answers the question; in the passage view it can be opened anytime.
- No streaks or guilt mechanics in the devotional ("Pick up with today").
- Each book keeps its own cover accent color within the shared series palette.
