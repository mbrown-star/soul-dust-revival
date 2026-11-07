# 05. Interactive Study reader (5 tabs)

**Roles covered:** user (the only role that reads study content — leader/admin have no special reader behavior)
**Fixtures used:** `qa-study-not-started` (study), lesson "Week 1: Grace and Truth" (has `studyContent`, 3 stations — one with no inline Greek match) and lesson "Introduction" (no `studyContent`)
**Related automated spec:** `qa/e2e/specs/study-reader.spec.ts`

## Walkthrough

1. Open "Week 1: Grace and Truth" as qa-user. → **Expect:** the breadcrumb reads exactly "Soul Dust Revival · QA Colossians-Shaped Study · Week 1 ▾" and the `<h1>` reads "Grace and Truth" (the title split correctly into label + heading).
2. Look at the 5-tab bar. → **Expect:** Study / Passage / Work the Word / Live It / Lift Up, each with a small dot indicator (unfilled, since nothing is marked done yet on a fresh fixture).
3. On the **Study** tab: read the key verse card, the "READ · REFLECT · RETURN" label, the two intro sections, then open "Part 1". → **Expect:** "0 of 2 parts read" before opening, "1 of 2 parts read" immediately after opening (it marks read the moment it's opened, not on a separate click).
4. On the **Passage** tab: find the two inline-underlined Greek words ("Grace", "faith") and the one fallback button for the unmatched station (labelled "ὑπομονή · 1:11"). → **Expect:** tapping an inline word opens the same Greek bottom sheet as tapping the fallback button for the unmatched one — the two paths should feel identical even though one is reached a different way.
5. Scroll to "Hide It in Your Heart". → **Expect:** it shows the fixture's real key verse and reference, and the word-hiding slider actually blanks words as you drag it (not just renders static text).
6. From the Greek sheet, tap "Go to this question". → **Expect:** lands on Work the Word, scrolled to the matching station (station 1, "Grace to you and peace...").
7. On **Work the Word**: step through all 3 stations with Next/Previous. → **Expect:** the numbered pill for a station fills in (turns solid) only once that station has *both* a saved answer and its Greek revealed — check this by answering station 1's question (type text, click elsewhere/blur) and opening its Greek, then confirm pill 1 fills while pills 2–3 don't yet.
8. On the last station, the Next button reads "Go to Live It →" (not "Next →") and clicking it switches to the Live It tab. → **Expect:** exactly this label change on the final station, nowhere else.
9. On **Live It**: confirm the eyebrow reads exactly "Life Application · Week 1" — not "Week N" literally, and not missing. → **Expect:** also see the practices checklist, the 5-minute prayer timer (lead-in → Father → Son → Spirit → close), and the Bottom Line callout.
10. On **Lift Up**: confirm the benediction, the "◆◆◆" divider, the closing verse + reference, and the "Quiet Question to Carry" card all render. → **Expect:** none of these are blank even though this is a short QA fixture (if the real content is empty, the section should still render its label, not disappear silently).
11. Go back to the week list and open "Introduction" (no `studyContent`). → **Expect:** no 5-tab shell at all — just a plain heading and the block's reading content, with no broken "undefined" tab bar or console error.
12. Reload the week 1 lesson, switch tabs several times rapidly (Study → Passage → Work the Word → Study). → **Expect:** a half-typed Work the Word answer or an opened Greek reveal survives switching away and back (panels stay mounted, not torn down).

## Information-consistency checks

- The header's week-progress ring (`N%`) should mathematically equal `(tabs marked done) / 5 × 100`, rounded — if you mark 2 of 5 tabs done, the ring should read 40%, not some other number.
- The tab bar's per-tab dot (filled/unfilled) must agree with whatever "done" condition that specific tab actually uses (Study: the "Finished the study" toggle; Passage: "Read and memorized"; Work the Word: all stations answered+revealed, automatic; Live It: "Living it this week"; Lift Up: "Carry it into the day") — a filled dot for a tab you never interacted with would be a real bug.
- The breadcrumb's book label and the Week Picker sheet's own heading (opened via the breadcrumb) must describe the same study — if the picker says "N Weeks" that count must match the study's real published lesson count.
- A Greek sheet opened from an inline-matched word and one opened from the unmatched-station fallback button must show the *same fields* (ref, word, transliteration, gloss, cross-reference, body, Live It) — there should be no second-class, less-complete version of this sheet for the fallback path.
- The Passage tab's rendering of a station with `anchor: null` must never silently drop that station — if a future week has more than one unmatched station, every one of them needs its own fallback button, not just the first.

## Known accepted trade-offs

These are real, already-documented decisions — don't re-report them as new findings:

- **Per-tab "done" flags, and the Study tab's per-Part read tracking, are localStorage-only** and do not sync across devices/browsers — this is deliberate reading-session chrome, not data the app reports on (CLAUDE.md, 2026-11-09 "newest yet" entry, and reaffirmed 2026-11-09 "later still").
- **The reference's "N of 5 Greek words opened" progress hint is deliberately not shown** on the Passage tab — it would require sharing "revealed" state between the Passage and Work the Word tabs, which are currently independent; flagged as a real, scoped-out design question, not an oversight (CLAUDE.md, 2026-11-11 entry).
- **"Answer first, then open the Greek" in Work the Word is a UI convention, not enforced** — a reader can open the Greek before answering, or never answer at all, without being blocked (CLAUDE.md, 2026-11-09 "newest yet" entry). Don't report "the Greek can be opened without answering" as a bug.
- **A reader who types an answer and navigates away via click without the textarea blurring first can lose that keystroke** (save is on-blur) — documented, not fixed, low severity (CLAUDE.md, 2026-11-09 "later" entry).
