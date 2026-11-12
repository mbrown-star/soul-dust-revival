#!/usr/bin/env python3
"""Parse a "Five Stations" Soul Dust Revival study PDF into enriched weeks JSON.

Usage:  python3 parse_five_stations.py <manuscript.pdf> <out.json>

"Five Stations" is the layout Colossians, 1 Peter, 1 Timothy, Ephesians,
Galatians, Philippians, James, John Parts 1-4, In Christ, Benedictions and
both Genesis parts share. Each week has an opener, SCRIPTURE STUDY · DIVE
(opening sections and Parts), THE PASSAGE (World English Bible), five verse
stations (QUESTION, GOING DEEPER · THE GREEK/HEBREW, LIVE IT), LIFE
APPLICATION (five practices), DAILY PRAYER, BOTTOM LINE, BENEDICTION, a
closing verse and QUIET QUESTION TO CARRY.

Unlike parse_study.py (written for Colossians alone), this goes by section
labels and by each line's size relative to the book's own body text, since
the titles are set in two type sizes, and it reads the passage text from
the manuscript itself (verse numbers are the small superscript digits), so
no outside Bible text is needed. The output already has the fields
build_study.py's enrich() adds (passage, verseNums, anchor, prayer beats),
in the shape scripts/backfill-study-content.ts loads.

Every week is checked; anything missing or unexpected is printed as a
warning and the script exits non-zero, so a bad parse never goes quietly.
"""
import collections, json, re, sys
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_study import PRAYER, find_anchor, parse_range  # noqa: E402

GREEK = re.compile(r"[Ͱ-Ͽἀ-῿]")
HEBREW = re.compile(r"[֐-׿]")
LIVE = re.compile(r"^LIVE ?IT\s*:?\s*")
ONE_CHAPTER = r"(?:JUDE|PHILEMON|OBADIAH|2 JOHN|3 JOHN)"
REF = re.compile(r"\d+:\d+|^" + ONE_CHAPTER + r"\s+\d+", re.I)


def ref_range(ref):
    """parse_range, plus one-chapter books written without a chapter ("Jude 20–25")."""
    m = re.match(r"^\s*" + ONE_CHAPTER + r"\s+(\d+)(?:\s*[–-]\s*(\d+))?", ref, re.I)
    if m and ":" not in ref:
        return (1, int(m[1])), (1, int(m[2] or m[1]))
    whole = re.search(r"\s(\d+)(?:\s*[–-]\s*(\d+))?\s*$", ref)
    if whole and ":" not in ref:  # whole chapters: "Genesis 3", "Genesis 6–9"
        return (int(whole[1]), 1), (int(whole[2] or whole[1]), 10_000)
    return parse_range(ref)


SMALL = set("a an and as at but by for from in into nor of on or the to with".split())


def title_case(s):
    """'FERVENTLY, FROM THE HEART' -> 'Fervently, from the Heart'. Leaves mixed case alone."""
    if s != s.upper():
        return s
    out = []
    for i, w in enumerate(s.lower().split(" ")):
        core = w.strip("“”\"'‘’(—,:;.!?")
        if i and core in SMALL:
            out.append(w)
        else:
            out.append(re.sub(r"[a-z]", lambda m: m.group().upper(), w, count=1))
    return " ".join(out)


def line_text(chars):
    """Rebuild a line from its characters, undoing letter-spacing ("P A R T")."""
    chars = sorted(chars, key=lambda c: c["x0"])
    ink = [c for c in chars if c["text"].strip()]
    gaps = [b["x0"] - a["x1"] for a, b in zip(ink, ink[1:])]
    size = max(c["size"] for c in ink)
    letters = re.sub(r"[^A-Za-z]", "", "".join(c["text"] for c in ink))
    median = sorted(gaps)[len(gaps) // 2] if gaps else 0
    tracked = len(ink) > 3 and letters == letters.upper() and median > 0.12 * size
    if tracked:  # letter-spaced capitals: only the wider gaps are word breaks
        out = ink[0]["text"]
        for g, c in zip(gaps, ink[1:]):
            out += (" " if g > median * 1.9 else "") + c["text"]
        return re.sub(r"\s+", " ", out).strip()
    out, prev = "", None
    for c in chars:
        if not c["text"].strip():
            out += " "
            continue
        if prev is not None and c["x0"] - prev["x1"] > 0.22 * c["size"]:
            out += " "
        out += c["text"]
        prev = c
    return re.sub(r"\s+", " ", out).strip()


def load_lines(path):
    lines = []
    with pdfplumber.open(path) as pdf:
        for pi, pg in enumerate(pdf.pages):
            for l in pg.extract_text_lines(return_chars=True):
                chars = [c for c in l["chars"] if c["text"].strip()]
                if not chars:
                    continue
                main = collections.Counter((round(c["size"], 1), c["fontname"].split("+")[-1]) for c in chars).most_common(1)[0][0]
                font = chars[0]["fontname"].split("+")[-1]
                t = line_text(l["chars"])
                lines.append(dict(t=t, page=pi, top=l["top"], x0=l["x0"], x1=l["x1"], size=main[0],
                                  first_size=round(chars[0]["size"], 1),
                                  bold="Bold" in font, ital="Italic" in font or "Oblique" in font,
                                  chars=chars))
    # Body size: the essay text between SCRIPTURE STUDY · DIVE and THE PASSAGE.
    # (Counting every line would let long printed passages win.)
    sizes, inside = collections.Counter(), False
    for l in lines:
        u = l["t"].upper().replace(" ", "")
        if l["bold"] and u.startswith("SCRIPTURESTUDY"):
            inside = True
        elif l["bold"] and u.startswith("THEPASSAGE"):
            inside = False
        elif inside and not l["bold"] and not l["ital"]:
            sizes[l["size"]] += 1
    if not sizes:
        sizes = collections.Counter(l["size"] for l in lines if not l["bold"])
    body = sizes.most_common(1)[0][0]
    keep = []
    for l in lines:
        u = l["t"].upper().replace(" ", "")
        if l["size"] < body - 2.5 and "SOULDUSTREVIVAL" in u and not l["bold"]:
            continue  # running header
        if l["size"] < body - 2.5 and u.startswith("SOULDUSTREVIVAL"):
            continue
        if re.fullmatch(r"\d{1,3}", l["t"]) and l["top"] > 560:
            continue  # page number
        if u.startswith("ENDOFWEEK"):
            continue
        if not l["t"].strip("◆◇♦•·* "):
            continue  # ornament
        keep.append(l)
    return keep, body


class Week:
    def __init__(self, L, body, warn):
        self.L, self.body, self.i, self.warn = L, body, 0, warn

    # --- line kinds, relative to the body size ---------------------------------
    def label(self, l):
        letters = re.sub(r"[^A-Za-z]", "", l["t"])
        return l["bold"] and l["size"] <= self.body - 1.5 and (
            (letters and letters == letters.upper()) or re.match(r"PART\s+[A-Z]+\b", l["t"])) \
            and not LIVE.match(l["t"])

    def is_label(self, l, *prefixes):
        k = l["t"].upper().replace(" ", "")
        return self.label(l) and any(k.startswith(p.replace(" ", "")) for p in prefixes)

    def heading(self, l):
        return l["bold"] and not l["ital"] and l["size"] >= self.body + 1.5 and not GREEK.search(l["t"]) and not HEBREW.search(l["t"])

    def pull(self, l):
        return l["bold"] and l["ital"] and l["size"] >= self.body + 1

    def word(self, l):
        return l["bold"] and (GREEK.search(l["t"]) or HEBREW.search(l["t"])) and l["size"] >= self.body + 1

    def practice(self, l):
        return l["bold"] and re.match(r"^\d+\.\s", l["t"]) and abs(l["size"] - self.body) <= 1.5

    # --- cursor helpers --------------------------------------------------------
    @property
    def cur(self):
        return self.L[self.i] if self.i < len(self.L) else None

    def take(self, pred):
        got = []
        while self.cur is not None and pred(self.cur):
            got.append(self.cur); self.i += 1
        return got

    def seek(self, pred, what):
        start = self.i
        while self.cur is not None and not pred(self.cur):
            self.i += 1
        if self.cur is None:
            self.warn(f"missing {what}")
            self.i = start
            return False
        return True

    # --- parse -----------------------------------------------------------------
    def parse(self):
        w = dict(study=dict(sections=[], parts=[]), stations=[], practices=[])
        L = self.L
        self.seek(lambda l: self.is_label(l, "WEEK"), "WEEK label")
        w["week"] = int(re.search(r"\d+", self.cur["t"].replace(" ", ""))[0]); self.i += 1
        self.take(lambda l: re.fullmatch(r"[IVXL]+", l["t"].replace(" ", "")) and l["size"] >= 30)
        w["title"] = joined(self.take(self.heading))
        sub_size = self.cur["size"] if self.cur is not None else 0
        w["subtitle"] = joined(self.take(lambda l: l["ital"] and not l["bold"] and l["size"] == sub_size
                                         and not l["t"].startswith(("“", "\""))))
        self.take(lambda l: not l["t"].strip("◆◇•· "))
        w["keyVerse"] = unquote(joined(self.take(lambda l: l["ital"] and not l["bold"] and not self.label(l))))
        if self.cur is not None and self.label(self.cur):
            w["keyRef"] = self.cur["t"]; self.i += 1

        # Scripture Study · Dive
        if self.seek(lambda l: self.is_label(l, "SCRIPTURE STUDY"), "SCRIPTURE STUDY · DIVE"):
            self.i += 1
        self.take(self.heading)
        self.take(lambda l: l["ital"] and not l["bold"] and l["size"] > self.body - 0.5)
        if self.cur is not None and self.label(self.cur) and REF.search(self.cur["t"]):
            self.i += 1
        cur, buf = None, []

        def flush():
            if cur is not None:
                cur["paras"] = paragraphs(buf, self.body)

        while self.cur is not None and not self.is_label(self.cur, "THE PASSAGE"):
            l = self.cur
            if self.heading(l):
                flush(); buf = []
                cur = dict(heading=joined(self.take(self.heading)))
                w["study"]["sections"].append(cur)
                continue
            if l["bold"] and not l["ital"] and re.match(r"PART\s+(ONE|TWO|THREE|FOUR|FIVE)\b", l["t"]):
                flush(); buf = []
                m = re.match(r"PART\s+(\w+)\s*[—–-]?\s*(.*)", l["t"])
                self.i += 1
                head = m[2].strip()
                if not head:  # "PART ONE" on its own, heading on the next line
                    head = joined(self.take(self.heading))
                cur = dict(label="PART " + m[1].upper(), heading=head)
                w["study"]["parts"].append(cur)
                continue
            if self.pull(l):
                q = unquote(joined(self.take(self.pull)))
                if cur is None:
                    self.warn("pull-quote before any section")
                else:
                    cur.setdefault("pulls", []).append(q)
                continue
            if not self.label(l):
                if cur is None:
                    cur = dict(heading=""); w["study"]["sections"].append(cur)
                buf.append(l)
            self.i += 1
        flush()
        w["study"]["sections"] = [s for s in w["study"]["sections"] if s["heading"] or s["paras"]]

        # The Passage
        self.i += 1
        w["passageRef"] = joined(self.take(self.heading))
        self.take(lambda l: self.is_label(l, "WORLD ENGLISH BIBLE"))
        plines = self.take(lambda l: not self.label(l))
        if self.cur is not None and self.label(self.cur) and "WEB" in self.cur["t"]:
            self.i += 1
        w["passage"] = verses_from_lines(plines, w["passageRef"], self.body, self.warn)

        # Working through the Word
        if self.seek(lambda l: self.label(l) and not REF.search(l["t"]), "stations label"):
            w["stationsLabel"] = self.cur["t"]; self.i += 1
        self.take(self.heading)
        w["stationsIntro"] = joined(self.take(lambda l: not self.label(l) and not self.heading(l)))
        while self.cur is not None and not self.is_label(self.cur, "LIFE APPLICATION"):
            l = self.cur
            if self.pull(l):
                q = unquote(joined(self.take(self.pull)))
                if w["stations"]:
                    w["stations"][-1].setdefault("pulls", []).append(q)
                else:
                    self.warn("pull-quote before the first station")
                nxt = self.L[self.i + 1] if self.i + 1 < len(self.L) else None
                is_ref = lambda x: x is not None and self.label(x) and REF.search(x["t"])
                if is_ref(self.cur) and is_ref(nxt):
                    self.i += 1  # the pull-quote's own attribution
                continue
            if not (self.label(l) and REF.search(l["t"])):
                if self.label(l) and l["t"].replace(" ", "") == "QUESTION" and w["stations"]:
                    # A second question inside one station: keep it with the first.
                    self.i += 1
                    extra = joined(self.take(lambda x: not self.label(x) and not self.word(x)))
                    w["stations"][-1]["question"] += " " + extra
                    self.warn(f"station {w['stations'][-1]['ref']} has two questions; joined")
                    continue
                self.warn(f"unexpected line in stations: {l['t'][:60]!r}")
                self.i += 1
                continue
            st = dict(ref=l["t"]); self.i += 1
            st["verse"] = unquote(joined(self.take(lambda x: not self.label(x))))
            if self.cur is not None and self.is_label(self.cur, "QUESTION"):
                self.i += 1
            st["question"] = joined(self.take(lambda x: not self.label(x) and not self.word(x)))
            if self.cur is not None and self.is_label(self.cur, "GOING DEEPER"):
                st["lang"] = "hebrew" if "HEBREW" in self.cur["t"].upper() else "greek"
                self.i += 1
            st["greek"] = joined(self.take(self.word))
            # Transliteration and gloss: one italic line ("eikōn — image, …") or
            # the transliteration on its own line and the gloss on the next
            # ("— a campaign; warfare"), up to the small cross-reference line.
            xref_line = lambda x: not x["bold"] and x["size"] <= self.body - 1.0 and REF.search(x["t"]) \
                and x["t"] == x["t"].upper()
            tl_lines = self.take(lambda x: x["ital"] and not x["bold"] and x["size"] >= self.body - 0.6
                                 and not xref_line(x))
            if tl_lines and " — " not in tl_lines[0]["t"]:
                tl_lines += self.take(lambda x: not xref_line(x) and not self.label(x) and x["t"].startswith(("—", "“", "\"")))
            tl = re.sub(r"^(.*?)\s*[—–]\s*", r"\1 — ", joined(tl_lines), count=1)
            parts = [p.strip() for p in tl.split(" — ", 1)]
            st["translit"], st["gloss"] = parts[0], (parts[1] if len(parts) > 1 else "")
            st["xref"] = joined(self.take(xref_line))
            st["body"] = paragraphs(self.take(lambda x: not LIVE.match(x["t"]) and not self.label(x)), self.body)
            lv = []
            if self.cur is not None and LIVE.match(self.cur["t"]):
                lv = [self.cur]; self.i += 1
                lv += self.take(lambda x: not self.label(x) and not LIVE.match(x["t"]) and not self.pull(x))
            st["live"] = LIVE.sub("", joined(lv))
            w["stations"].append(st)

        # Life Application
        self.i += 1
        w["lifeTitle"] = joined(self.take(self.heading))
        intro, pulls = [], []
        while self.cur is not None and not self.practice(self.cur) and not self.label(self.cur):
            if self.pull(self.cur):
                pulls.append(unquote(joined(self.take(self.pull))))
                continue
            intro.append(self.cur); self.i += 1
        w["lifeIntro"] = joined(intro)
        w["lifePulls"] = pulls
        while self.cur is not None and self.practice(self.cur):
            m = re.match(r"(\d+)\.\s+(.+)", self.cur["t"]); self.i += 1
            body = paragraphs(self.take(lambda l: not self.practice(l) and not self.label(l)), self.body)
            w["practices"].append(dict(n=int(m[1]), title=m[2], body=" ".join(body)))
        self.take(lambda l: not l["t"].strip("◆◇•· "))
        if self.seek(lambda l: self.is_label(l, "DAILY PRAYER", "A PRAYER", "PRAYER"), "DAILY PRAYER"):
            self.i += 1
        prayer_lines = self.take(lambda l: not self.label(l))
        w["prayer"] = joined(prayer_lines)
        w["prayerLines"] = [l["t"] for l in prayer_lines]
        if self.seek(lambda l: self.is_label(l, "BOTTOM LINE"), "BOTTOM LINE"):
            self.i += 1
        w["bottomLine"] = paragraphs(self.take(lambda l: not self.label(l)), self.body)

        # Benediction
        if self.seek(lambda l: self.is_label(l, "BENEDICTION"), "BENEDICTION"):
            self.i += 1
        self.take(self.heading)
        # The benediction runs to a closing: either a Scripture verse (italic,
        # opening with a quotation mark, followed by its reference) or a
        # bold-italic pull-quote. A quotation inside the benediction itself
        # doesn't end it; only the last such block does.
        block = self.take(lambda l: not self.label(l))
        k = len(block)
        while k and self.pull(block[k - 1]):
            k -= 1
        if k == len(block):
            starts = [j for j, l in enumerate(block) if l["t"].startswith(("“", "\""))
                      and all(x["ital"] and not x["bold"] for x in block[j:])]
            k = starts[0] if starts else len(block)
        w["benediction"] = paragraphs(block[:k], self.body)
        closing = block[k:]
        w["closingVerse"] = unquote(joined(closing))
        w["closingIsPull"] = bool(closing) and all(self.pull(l) for l in closing)
        if self.cur is not None and self.label(self.cur) and REF.search(self.cur["t"]):
            w["closingRef"] = self.cur["t"]; self.i += 1
        if self.seek(lambda l: self.is_label(l, "QUIET QUESTION", "A QUIET QUESTION"), "QUIET QUESTION TO CARRY"):
            self.i += 1
        w["carry"] = joined(self.take(lambda l: not self.label(l)))
        return w


def joined(lines):
    return re.sub(r"\s+", " ", " ".join(l["t"] for l in lines)).strip()


def unquote(s):
    return s.strip().strip("“”\"").strip()


SPACED = True  # set per book in main(): does it put space between paragraphs?


def paragraphs(lines, body):
    """Join lines into paragraphs by vertical gaps and page breaks. A few
    books (Philippians) set paragraphs with no space between them and justify
    the text; there a line that ends a sentence short of the margin ends a
    paragraph. (Most books are ragged-right, where that rule would misfire.)"""
    right = collections.defaultdict(float)
    for l in lines:
        right[l["page"]] = max(right[l["page"]], l["x1"])
    paras, prev = [], None
    for l in lines:
        new = prev is None
        if prev is not None:
            ends = prev["t"][-1:] in ".?!”’\"'"
            if l["page"] != prev["page"]:
                new = ends and prev["x1"] < right[prev["page"]] - 25
            else:
                new = (l["top"] - prev["top"]) > max(l["size"], body) * 1.75 \
                    or (not SPACED and ends and prev["x1"] < right[prev["page"]] - 25)
        if new:
            paras.append(l["t"])
        else:
            paras[-1] += " " + l["t"]
        prev = l
    return [re.sub(r"\s+", " ", p).strip() for p in paras]


def verses_from_lines(lines, ref, body, warn):
    """Split the printed passage into verses at its superscript verse numbers."""
    try:
        (c1, v1), (c2, v2) = ref_range(ref)
    except TypeError:
        warn(f"can't read passage reference {ref!r}"); return []
    # Verse numbers are small digits. Some books set them on their own
    # baseline, so pdfplumber reports them as a separate "line" just below
    # the text line they belong to: fold those back in by position.
    marker = lambda c: c["size"] < body - 1.5 and (c["text"].isdigit() or c["text"] == ":")
    rows = []
    for l in lines:
        ink = [c for c in l["chars"] if c["text"].strip()]
        head = re.fullmatch(r"(?:[123] )?[A-Z][a-z]+(?: of [A-Z][a-z]+)? (\d+)", l["t"]) if l["bold"] else None
        if head:  # a chapter heading inside a multi-chapter passage
            rows.append(dict(top=l["top"], chars=[], chapter=int(head[1])))
            continue
        if ink and all(marker(c) for c in ink) and rows and abs(l["top"] - rows[-1]["top"]) < 8:
            rows[-1]["chars"] = rows[-1]["chars"] + l["chars"]
        else:
            rows.append(dict(top=l["top"], chars=list(l["chars"])))
    chars = []
    for r in rows:
        if "chapter" in r:
            chars.append(({"text": "", "size": body, "chapter": r["chapter"]}, 0))
            continue
        cs = sorted(r["chars"], key=lambda c: c["x0"])
        for j, c in enumerate(cs):
            gap = c["x0"] - cs[j - 1]["x1"] if j else 99
            chars.append((c, gap))
        chars.append(({"text": " ", "size": body}, 0))
    verses, text, num, digits, chap = [], "", None, "", c1
    pending_chap = None

    def mark(n):
        """A verse number. The same number again (a quoted line resuming a
        verse) continues that verse; a smaller one starts the next chapter;
        "2:1" names the chapter outright."""
        nonlocal text, num, chap, pending_chap
        new_chap, pending_chap = pending_chap, None
        if ":" in str(n):
            new_chap, n = (int(x) for x in str(n).split(":")[:2])
        else:
            n = int(n)
        if num is not None and n == num and new_chap is None:
            text += " "
            return
        if num is not None or text.strip():
            verses.append([chap, num, text])
        if new_chap is not None:
            chap = new_chap
        elif num is not None and n < num:
            chap += 1
        num, text = n, ""

    prev_digit = None
    for c, gap in chars:
        if "chapter" in c:
            if digits:
                mark(digits); digits = ""
            pending_chap = c["chapter"]
            continue
        if marker(c):
            if digits and prev_digit is not None and c["x0"] - prev_digit["x1"] > 0.8:
                mark(digits); digits = ""  # two numbers side by side ("39 40")
            digits += c["text"]; prev_digit = c
            continue
        if digits:
            mark(digits); digits = ""
        if c["text"] == " ":
            text += " "
        else:
            text += (" " if gap > 0.22 * c["size"] and not text.endswith(" ") else "") + c["text"]
    if digits:
        mark(digits)
    if num is not None:
        verses.append([chap, num, text])
    out = [dict(c=c, n=n if n is not None else v1, text=re.sub(r"\s+", " ", t).strip()) for c, n, t in verses]
    out = [v for v in out if v["text"]]
    if not out:
        warn(f"no passage verses for {ref}")
    elif (out[0]["c"], out[0]["n"]) != (c1, v1) or out[-1]["c"] != c2 or (v2 != 10_000 and out[-1]["n"] != v2):
        warn(f"passage {ref}: read {out[0]['c']}:{out[0]['n']}–{out[-1]['c']}:{out[-1]['n']}")
    return out


def book_of(ref):
    """'1 PETER 1:22' -> '1PETER'; 'Psalm 103:1' and 'PSALMS 103' -> 'PSALM'."""
    m = re.match(r"\s*((?:[123]\s*)?[A-Za-z]+(?:\s+of\s+[A-Za-z]+)?)", ref)
    return re.sub(r"\s+|S$", "", m[1].upper()) if m else ""


def finish(w):
    """Add the reader's derived fields (as build_study.py's enrich() does)."""
    for st in w["stations"]:
        try:
            a, b = ref_range(st["ref"])
        except TypeError:
            a = b = None
        if book_of(st["ref"]) != book_of(w["passageRef"]):
            a = None  # a verse from another book: printed at the station, not in the passage
        st["verseNums"] = [f"{v['c']}:{v['n']}" for v in w["passage"] if a and a <= (v["c"], v["n"]) <= b]
        st["anchor"] = find_anchor(st, [v for v in w["passage"] if f"{v['c']}:{v['n']}" in st["verseNums"]])
    beats = PRAYER.findall(w["prayer"])
    if len(beats) == 3:
        w["prayerLead"] = w["prayer"][: w["prayer"].index(beats[0][0] + ",")].strip()
        w["prayerBeats"] = [dict(person=p, verb=v, words=t) for p, v, t in beats]
        w["prayerClose"] = w["prayer"][w["prayer"].rindex("'") + 1:].strip()
    else:
        w["prayerLead"], w["prayerBeats"], w["prayerClose"] = "", [], ""
    return w


def check(w, warn):
    if len(w["stations"]) != 5:
        warn(f"{len(w['stations'])} stations")
    if len(w["practices"]) != 5:
        warn(f"{len(w['practices'])} practices")
    if len(w["study"]["parts"]) < 2:
        warn(f"{len(w['study']['parts'])} parts")
    if not w.get("closingRef") and not w.get("closingIsPull"):
        warn("empty closingRef")
    for k in ("title", "keyVerse", "keyRef", "passageRef", "lifeTitle", "prayer", "closingVerse", "carry"):
        if not w.get(k):
            warn(f"empty {k}")
    for k in ("bottomLine", "benediction", "passage"):
        if not w.get(k):
            warn(f"empty {k}")
    vs = [(v["c"], v["n"]) for v in w.get("passage", [])]
    for (c0, n0), (c1, n1) in zip(vs, vs[1:]):
        if not ((c1 == c0 and n1 == n0 + 1) or (c1 == c0 + 1 and n1 == 1)):
            warn(f"passage jumps from {c0}:{n0} to {c1}:{n1}")
    for st in w["stations"]:
        if not st.get("greek") and st.get("lang") != "hebrew":
            warn(f"station {st['ref']}: empty greek")
        for k in ("verse", "question", "translit", "gloss", "live"):
            if not st.get(k):
                warn(f"station {st['ref']}: empty {k}")
        if not st["body"]:
            warn(f"station {st['ref']}: empty word study")


def main(pdf_path, out_path):
    global SPACED
    L, body = load_lines(pdf_path)
    # Paragraph spacing: count gaps of one and a half to three lines between
    # consecutive body lines on a page.
    gaps = [b["top"] - a["top"] for a, b in zip(L, L[1:])
            if a["page"] == b["page"] and a["size"] == b["size"] == body and not a["bold"] and not b["bold"]]
    wide = sum(1 for g in gaps if body * 1.75 < g < body * 3)
    SPACED = wide > 0.02 * len(gaps)
    # A week opens with its roman numeral and "WEEK n", in either order.
    roman = lambda l: re.fullmatch(r"[IVXL]+", l["t"].replace(" ", "")) and l["size"] >= 30
    weekl = lambda l: re.fullmatch(r"WEEK\s*\d+", l["t"].replace(" ", ""))
    starts = []
    for j in range(len(L) - 1):
        if roman(L[j]) and weekl(L[j + 1]):
            starts.append(j)
        elif weekl(L[j]) and roman(L[j + 1]):
            starts.append(j)
    weeks, problems = [], 0
    for a, s in enumerate(starts):
        e = starts[a + 1] if a + 1 < len(starts) else len(L)
        msgs = []
        week = Week(L[s:e], body, msgs.append)
        try:
            w = finish(week.parse())
            check(w, msgs.append)
        except Exception as err:  # report and keep going so every week is seen
            msgs.append(f"parse failed: {err!r}")
            w = None
        if w:
            weeks.append(w)
            print(f"Week {w['week']:>2}: {w['title'][:34]:34} | {w['passageRef'][:22]:22} | "
                  f"sec {len(w['study']['sections'])} parts {len(w['study']['parts'])} "
                  f"verses {len(w['passage'])} st {len(w['stations'])} pr {len(w['practices'])} "
                  f"beats {len(w['prayerBeats'])}")
        for m in msgs:
            print(f"   ! {m}")
        problems += len(msgs)
    if len(weeks) != 12:
        print(f"! found {len(weeks)} weeks"); problems += 1
    json.dump(weeks, open(out_path, "w"), ensure_ascii=False, indent=1)
    outside = sum(1 for w in weeks for st in w["stations"] if not st["verseNums"])
    print(f"note: {outside} of {sum(len(w['stations']) for w in weeks)} stations quote a verse outside "
          f"their week's passage (shown at the station, with a link from the Passage tab)")
    print(f"paragraph spacing: {SPACED}")
    print(f"{len(weeks)} weeks, {problems} warnings -> {out_path}")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
