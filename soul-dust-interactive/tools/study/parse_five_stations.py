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

It also reads the Journey's Parts One to Three (no printed passage) and the
"Passage Walk" books: Dusty and Holy (Hebrews), Dusty but Hopeful (Romans),
The Sermon on the Mount, Ecclesiastes, Law and Gospel and Journey Part Four.
Those print the passage under THE WORD, then 7 to 12 stations under "THE
WORD ON …", with five word studies among them; their cross-references are
in ordinary case, and some set a word's transliteration on its own line.

And the "Gathered Passages" books (Prayer, The Gospel, The Holy Spirit, The Ten
Commandments): a passage gathered from several places, each part under its
own reference line (read part by part; the first verse of each part carries
`ref`, and an anchor in such a passage names its `part`), a key verse that
opens the study instead of the opener (which prints only ANCHOR · …), a
MY ANSWER label after each question, and Prayer's own type: unbolded Greek,
bold cross-references, practices in small capitals, unbolded pull-quotes,
witness names, a benediction signed instead of closed with a verse.
Control characters (ornaments that extract as NUL) are dropped.

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
import collections, json, re, sys, unicodedata
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_study import PRAYER, find_anchor, parse_range  # noqa: E402

GREEK = re.compile(r"[Ͱ-Ͽἀ-῿]")
CITES = re.compile(r"(?:[1-3]\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s+\d+:\d+")  # a line opening with a reference
CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
LATIN = re.compile("[A-Za-z\u00C0-\u024F\u1E00-\u1EFF\u02B0-\u02FF]")  # a transliteration's letters
HEBREW = re.compile("[\u0590-\u05FF\uFB1D-\uFB4F]")  # includes presentation forms (U+FB2B, שׂ)
LIVE = re.compile(r"^LIVE ?IT\s*:?\s*")
ONE_CHAPTER = r"(?:JUDE|PHILEMON|OBADIAH|2 JOHN|3 JOHN)"
REF = re.compile(r"\d+:\d+|^" + ONE_CHAPTER + r"\s+\d+", re.I)


REF_ITEM = re.compile(r"(?:[123]\s?)?[A-Za-z]+(?:\s(?:of\s)?[A-Za-z]+)?\s\d+(?::\d+)?(?:\s?[–-]\s?\d+(?::\d+)?)?"
                      r"(?:,\s?\d+(?:[–-]\d+)?)*(?:\s\([^)]*\))?")


def ref_list(text):
    """A word study's cross-reference line: references only, separated by
    "; " or " · " ("1 John 2:1 · John 14:16", "PHILIPPIANS 1:10; 2 PETER 3:1")."""
    items = [t.strip() for t in re.split(r";|·", text) if t.strip()]
    return bool(items) and all(REF_ITEM.fullmatch(t) for t in items) and bool(REF.search(text))


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


def hebrew_logical(lines, translit):
    """Hebrew is extracted in visual order: letters left to right, each
    followed by its vowel points, with stray gaps. Rebuild it in reading
    order: cluster each letter with its marks, reverse the clusters, and put
    word breaks at the widest gaps (as many as the transliteration has)."""
    chars = sorted((c for l in lines for c in l["chars"] if c["text"].strip()), key=lambda c: c["x0"])
    clusters = []
    for c in chars:
        # Presentation forms (U+FB2B שׂ) become a letter plus its mark.
        for ch in unicodedata.normalize("NFKC", c["text"]):
            if unicodedata.combining(ch) and clusters:
                clusters[-1]["t"] += ch
            else:
                clusters.append(dict(t=ch, x0=c["x0"], x1=c["x1"]))
    if not clusters:
        return ""
    gaps = sorted(((b["x0"] - a["x1"], i) for i, (a, b) in enumerate(zip(clusters, clusters[1:]))), reverse=True)
    breaks = {i for _, i in gaps[: max(0, len(translit.split()) - 1)]}
    visual = ""
    for i, c in enumerate(clusters):
        visual += c["t"] + (" " if i in breaks else "")
    # Reverse cluster by cluster (marks stay after their letter).
    out = []
    for word in visual.split(" "):
        cs, cur = [], ""
        for ch in word:
            if unicodedata.combining(ch) and cur:
                cur += ch
            else:
                if cur:
                    cs.append(cur)
                cur = ch
        if cur:
            cs.append(cur)
        out.append("".join(reversed(cs)))
    return " ".join(reversed(out))


def plain_text(line, body):
    """A line's text without its small superscript verse numbers."""
    chars = [c for c in line["chars"] if not (c["text"].isdigit() and c["size"] < body - 1.5)]
    return line_text(chars) if chars else ""


def line_text(chars):
    return fix_ligatures(_line_text(chars))


def fix_ligatures(text):
    """Journey Part One's font maps its "fi" ligature to "/": "will not /x
    everything" is "will not fix everything". Only the standalone word."""
    return re.sub(r"(?<![\w/])/x\b", "fix", text)


def _line_text(chars):
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
                # Some ornaments extract as control characters (NUL in The Holy
                # Spirit), which Postgres refuses in text: drop them first.
                l = dict(l, chars=[c for c in l["chars"] if not CONTROL.search(c["text"])])
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
        if l["bold"] and (u.startswith("SCRIPTURESTUDY") or u == "STUDY"):
            inside = True
        elif l["bold"] and (u.startswith("THEPASSAGE") or u == "REFLECTION" or u.startswith("THEWORDON")):
            inside = False
        elif inside and not l["bold"] and not l["ital"]:
            sizes[l["size"]] += 1
    if not sizes:
        sizes = collections.Counter(l["size"] for l in lines if not l["bold"])
    body = sizes.most_common(1)[0][0]
    right = collections.defaultdict(float)
    for l in lines:
        if l["size"] == body and not l["bold"]:
            right[l["page"]] = max(right[l["page"]], l["x1"])
    keep = []
    for l in lines:
        l["right"] = right[l["page"]] or l["x1"]
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
        # Bold italic; Prayer sets them in larger italic without bold.
        return l["ital"] and ((l["bold"] and l["size"] >= self.body + 1) or l["size"] >= self.body + 2)

    def word(self, l):
        # Bold, or (Prayer) large without bold.
        return (l["bold"] or l["size"] >= self.body + 3) and (GREEK.search(l["t"]) or HEBREW.search(l["t"])) \
            and l["size"] >= self.body + 1

    def practice(self, l):
        # Body size, or (Prayer) small capitals: "1. PRAY IT SLOWLY, ONE PHRASE A DAY".
        return l["bold"] and re.match(r"^\d+\.\s", l["t"]) and (
            abs(l["size"] - self.body) <= 1.5 or (self.label(l) and l["t"] == l["t"].upper()))

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

    def word_study(self, st):
        """GOING DEEPER · THE GREEK/HEBREW: the word, transliteration, gloss,
        cross-references, study and LIVE IT, read into station `st`."""
        st["lang"] = "hebrew" if "HEBREW" in self.cur["t"].upper() else "greek"
        self.i += 1
        word_lines = self.take(self.word)
        # Some books set the transliteration on the word's own line
        # ("ארָבָּ bārāʾ"), with the gloss on the plain line below.
        inline_tl = [c for l in word_lines for c in l["chars"] if LATIN.search(c["text"])]
        if inline_tl:
            word_lines = [dict(l, chars=[c for c in l["chars"] if not LATIN.search(c["text"])]) for l in word_lines]
            for l in word_lines:
                l["t"] = line_text(l["chars"]).strip()
        # Transliteration and gloss: one italic line ("eikōn — image, …"),
        # or the transliteration on its own line and the gloss on the next
        # ("— a campaign; warfare", or plain "counsellor"), up to the small
        # cross-reference line.
        # Capitals, a list of full references, or (the Passage Walk books) any
        # line that opens with a reference: "Hebrews 1:4; 7:19, 22".
        xref_line = lambda x: x["size"] <= self.body - 1.0 and REF.search(x["t"]) and (
            (not x["bold"] and (re.sub(r"\([^)]*\)", "", x["t"]) == re.sub(r"\([^)]*\)", "", x["t"]).upper()
                                or ref_list(x["t"]) or CITES.match(x["t"])))
            or (x["bold"] and ref_list(x["t"])))  # Prayer sets them bold
        tl_lines = self.take(lambda x: x["ital"] and not x["bold"] and x["size"] >= self.body - 0.6
                             and not xref_line(x))
        if tl_lines and " — " not in tl_lines[0]["t"]:
            nxt = self.L[self.i + 1] if self.i + 1 < len(self.L) else None
            if self.cur is not None and (self.cur["t"].startswith(("—", "“", "\""))
                                         or (nxt is not None and xref_line(nxt) and not xref_line(self.cur))):
                tl_lines.append(self.cur); self.i += 1
        if tl_lines and self.cur is not None and not xref_line(self.cur) \
                and any(xref_line(x) for x in self.L[self.i:self.i + 4]):
            # A gloss that wraps onto plain lines: run on, at its own size, to
            # the cross-references that follow it.
            gloss_size = tl_lines[-1]["size"]
            tl_lines += self.take(lambda x: not xref_line(x) and not self.label(x)
                                  and abs(x["size"] - gloss_size) <= 0.6)
        if inline_tl:
            gloss = tl_lines or self.take(lambda x: not x["bold"] and not xref_line(x) and x["size"] >= self.body - 0.6)
            st["translit"] = line_text(inline_tl).strip()
            st["gloss"] = re.sub(r"^[—–]\s*", "", joined(gloss))
        else:
            tl = re.sub(r"^(.*?)\s*[—–]\s*", r"\1 — ", joined(tl_lines), count=1)
            if " — " not in tl and len(tl_lines) > 1:
                tl = tl_lines[0]["t"] + " — " + joined(tl_lines[1:])
            parts = [p.strip() for p in tl.split(" — ", 1)]
            st["translit"], st["gloss"] = parts[0], (parts[1] if len(parts) > 1 else "")
        st["greek"] = hebrew_logical(word_lines, st["translit"]) if st["lang"] == "hebrew" \
            and HEBREW.search(joined(word_lines)) else joined(word_lines)
        st["xref"] = joined(self.take(xref_line))
        st["body"] = paragraphs(self.take(lambda x: not LIVE.match(x["t"]) and not self.label(x)
                                          and not self.pull(x)), self.body)
        lv = []
        if self.cur is not None and LIVE.match(self.cur["t"]):
            lv = [self.cur]; self.i += 1
            lv += self.take(lambda x: not self.label(x) and not LIVE.match(x["t"]) and not self.pull(x)
                            and not (x["bold"] and re.match(r"QUESTION\s+\S", x["t"])))
        st["live"] = LIVE.sub("", joined(lv))

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
        kv = self.take(lambda l: l["ital"] and not l["bold"] and not self.label(l))
        if kv and kv[-1]["t"].startswith("—"):
            w["keyRef"] = kv[-1]["t"].lstrip("— ").strip()
            kv = kv[:-1]
        w["keyVerse"] = unquote(joined(kv))
        if self.cur is not None and self.label(self.cur) and REF.search(self.cur["t"]):
            w["keyRef"] = self.cur["t"]; self.i += 1
        if w.get("keyRef", "").upper().startswith("ANCHOR"):
            # The Gathered Passages books name the week's passages here
            # ("ANCHOR · EPHESIANS 2:1–3"); their key verse opens the study below.
            w["keyRef"], w["keyVerse"] = "", ""

        # Scripture Study · Dive
        if self.seek(lambda l: self.is_label(l, "SCRIPTURE STUDY") or (self.label(l) and l["t"] == "STUDY"),
                     "SCRIPTURE STUDY · DIVE"):
            self.i += 1
        self.take(self.heading)
        epigraph = self.take(lambda l: l["ital"] and not l["bold"] and (l["size"] > self.body - 0.5 or l["t"].startswith("—")))
        epigraph_ref = ""
        if self.cur is not None and self.label(self.cur) and REF.search(self.cur["t"]):
            epigraph_ref = self.cur["t"]; self.i += 1
        if not w.get("keyVerse") and epigraph and epigraph_ref:
            # No key verse in the opener: the verse that opens the study is it.
            text = joined([l for l in epigraph if not l["t"].startswith("—")])
            # Two quotations ("“Lord, teach us to pray” “Our Father…”") keep their marks.
            w["keyVerse"] = text if text.count("“") > 1 else unquote(text)
            w["keyRef"] = epigraph_ref
        cur, buf = None, []

        def flush():
            # buf holds lines and {"head": …} markers for a Part's sub-headings.
            if cur is None:
                return
            paras, seg = [], []
            for x in buf + [None]:
                if x is None or "head" in x:
                    paras += paragraphs(seg, self.body); seg = []
                    if x is not None:
                        cur.setdefault("heads", []).append(dict(at=len(paras), text=x["head"]))
                else:
                    seg.append(x)
            cur["paras"] = paras

        def study_ends(l):
            return self.is_label(l, "THE PASSAGE", "THE WORD ON") or (self.label(l) and l["t"] in ("REFLECTION", "THE WORD"))

        while self.cur is not None and not study_ends(self.cur):
            l = self.cur
            if self.label(l) and l["t"].startswith("—"):
                self.i += 1  # a pull-quote's credit ("— THE SOUL DUST TEAM")
                continue
            if cur is not None and l["bold"] and not l["ital"] and not self.label(l) and not self.heading(l) \
                    and re.match(r"[A-Z][A-Z .’'-]+ — \S", l["t"]) and not re.match(r"PART\s", l["t"]):
                # A witness's name in Prayer's box ("AUGUSTINE — prayer as the exercise of desire").
                buf.append({"head": l["t"]})
                self.i += 1
                continue
            if self.label(l) and not REF.search(l["t"]) and not re.match(r"PART\s", l["t"]):
                # A small-capitals heading: a new section, or inside a Part, a sub-heading.
                if cur is not None and "label" in cur:
                    buf.append({"head": l["t"]})
                else:
                    flush(); buf = []
                    cur = dict(heading=l["t"]); w["study"]["sections"].append(cur)
                self.i += 1
                continue
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
                    # (Law and Gospel sets it only half a point above the body)
                    head = joined(self.take(lambda x: self.heading(x) or (
                        x["bold"] and not x["ital"] and not self.label(x) and x["size"] > self.body + 0.25)))
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

        # The Passage (the Journey's Parts One–Three print none)
        w["passageRef"], w["passage"] = "", []
        # Labelled THE PASSAGE, or in the Passage Walk books THE WORD (with the
        # stations' own label, "THE WORD ON …", after it).
        if self.cur is not None and (self.is_label(self.cur, "THE PASSAGE")
                                     or (self.label(self.cur) and self.cur["t"] == "THE WORD")):
            self.i += 1
            w["passageRef"] = joined(self.take(self.heading))
            self.take(lambda l: self.is_label(l, "WORLD ENGLISH BIBLE")
                      or (l["ital"] and l["t"].strip().upper() == "WORLD ENGLISH BIBLE"))
            parts = passage_parts(w["passageRef"])
            if len(parts) > 1:
                # Gathered passages ("Luke 11:1–4; Matthew 6:9–10"): each part is
                # printed under its own reference, which may be a small-capitals
                # label, so read through those labels.
                plines = self.take(lambda l: not self.label(l)
                                   or (PART_REF.fullmatch(l["t"].strip()) and "WEB" not in l["t"]))
            else:
                # Some print the reference again as a small label above the text.
                self.take(lambda l: self.label(l) and PART_REF.fullmatch(l["t"].strip())
                          and book_of(l["t"]) == book_of(w["passageRef"]))
                plines = self.take(lambda l: not self.label(l))
            if self.cur is not None and self.label(self.cur) and "WEB" in self.cur["t"]:
                self.i += 1
            if len(parts) > 1:
                w["passage"] = passage_in_parts(plines, parts, self.body, self.warn)
            else:
                w["passage"] = verses_from_lines(plines, w["passageRef"], self.body, self.warn)
            w["hasPassage"] = True

        # Working through the Word
        if self.seek(lambda l: self.label(l) and not REF.search(l["t"]), "stations label"):
            w["stationsLabel"] = self.cur["t"]; self.i += 1
        self.take(self.heading)
        w["stationsIntro"] = joined(self.take(lambda l: not self.label(l) and not self.heading(l)))
        pending = []  # word studies printed before the station they belong to
        while self.cur is not None and not self.is_label(self.cur, "LIFE APPLICATION"):
            l = self.cur
            if self.label(l) and l["t"].replace(" ", "") == "MYANSWER":
                self.i += 1  # the printed space to write in (the reader has its own box)
                continue
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
                elif self.cur is not None and not self.cur["bold"] and self.cur["size"] <= self.body - 3 \
                        and re.match(r"ON\s", self.cur["t"]):
                    self.i += 1  # "ON 1 JOHN 1:9"
                continue
            if self.is_label(l, "GOING DEEPER") and w["stations"]:
                # A word study printed away from its station (after a pull-quote,
                # or two in a row): it belongs to the station without one whose
                # reference its cross-references name, else the latest such.
                ws = {}
                self.word_study(ws)
                def covers(st, xref):
                    """Does the station's passage include the cross-reference's verse?"""
                    if book_of(st["ref"]) != book_of(xref):
                        return False
                    try:
                        start, end = ref_range(st["ref"])
                        verse, _ = ref_range(xref)
                    except (TypeError, ValueError):
                        return False
                    return start <= verse <= end
                xrefs = [x.strip() for x in re.split(r"[;·]", ws.get("xref", "")) if x.strip()]
                named = lambda st, xrefs=xrefs: any(covers(st, x) for x in xrefs)
                open_ = [st for st in w["stations"] if not st.get("lang")]
                target = next((st for st in reversed(open_) if named(st)), None)
                if target is None:
                    owner = next((st for st in reversed(w["stations"]) if named(st)), None)
                    if owner is not None:  # a second word study on one verse
                        owner.setdefault("moreStudies", []).append(ws)
                        continue
                    target = open_[-1] if open_ and not xrefs else None
                if target is None:
                    # Its station may come later on the page; if none does, it
                    # stays with the station it was printed under.
                    pending.append((ws, named, w["stations"][-1]))
                else:
                    target.update(ws)
                continue
            if self.label(l) and w["stations"] and not REF.search(l["t"]) \
                    and not self.is_label(l, "QUESTION", "GOING DEEPER"):
                # A capstone week's closing essay after its stations
                # ("MOVEMENT ONE CLOSING · Looking Back, Looking Forward").
                self.i += 1
                inter = dict(label=l["t"], heading=joined(self.take(self.heading)))
                buf = []
                while self.cur is not None and not self.is_label(self.cur, "LIFE APPLICATION"):
                    x = self.cur
                    if self.label(x):
                        buf.append({"head": x["t"]})
                    elif self.pull(x):
                        inter.setdefault("pulls", []).append(unquote(joined(self.take(self.pull))))
                        continue
                    else:
                        buf.append(x)
                    self.i += 1
                paras, seg = [], []
                for x in buf + [None]:
                    if x is None or "head" in x:
                        paras += paragraphs(seg, self.body); seg = []
                        if x is not None:
                            inter.setdefault("heads", []).append(dict(at=len(paras), text=x["head"]))
                    else:
                        seg.append(x)
                inter["paras"] = paras
                w["interlude"] = inter
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
            q_inline = lambda x: x["bold"] and re.match(r"QUESTION\s+\S", x["t"])
            stop = lambda x: self.label(x) or q_inline(x) or self.word(x) or self.pull(x)
            # The verse (italic, or set apart in a smaller size), then any
            # commentary in body text before the question.
            verse = self.take(lambda x: not stop(x) and not (not x["ital"] and x["size"] == self.body))
            st["verse"] = unquote(re.sub(r"\s+", " ", " ".join(plain_text(x, self.body) for x in verse)).strip())
            note = self.take(lambda x: not stop(x))
            if note:
                st["note"] = paragraphs(note, self.body)
            if self.cur is not None and q_inline(self.cur):
                first = re.sub(r"^QUESTION\s+", "", self.cur["t"]); self.i += 1
                st["question"] = (first + " " + joined(self.take(lambda x: not stop(x) and not LIVE.match(x["t"])))).strip()
            else:
                if self.cur is not None and self.is_label(self.cur, "QUESTION"):
                    self.i += 1
                st["question"] = joined(self.take(lambda x: not stop(x)))
            st["greek"] = st["translit"] = st["gloss"] = st["xref"] = st["live"] = ""
            st["body"] = []
            if self.cur is not None and self.label(self.cur) and self.cur["t"].replace(" ", "") == "MYANSWER":
                self.i += 1  # the printed space to write in
            if self.cur is not None and self.is_label(self.cur, "GOING DEEPER"):
                self.word_study(st)
            for item in list(pending):
                ws, named, _ = item
                if named(st):
                    (st.setdefault("moreStudies", []).append(ws) if st.get("lang") else st.update(ws))
                    pending.remove(item)
            w["stations"].append(st)

        for ws, _, under in pending:
            # No station's verses include it (a word from a verse the week
            # doesn't print as a station): a second study on the station
            # it was printed under.
            under.setdefault("moreStudies", []).append(ws)
            print(f"   note: word study {ws.get('translit')!r} kept with {under['ref']}, the station it follows")

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
            title, first = m[2], []
            # "NAME THE LOOP — Confession here means…": the body runs on after the
            # capitals. (A dash inside the capitals, "NAME YOURSELF — JACOB", stays.)
            lower = re.search(r"[a-z]", title)
            cut = title.rfind(" — ", 0, lower.start()) if lower else -1
            if cut > 0 and title[:cut] == title[:cut].upper():
                first = [dict(self.L[self.i - 1], t=title[cut + 3:])]
                title = title[:cut]
            body = paragraphs(first + self.take(lambda l: not self.practice(l) and not self.label(l)), self.body)
            w["practices"].append(dict(n=int(m[1]), title=title, body=" ".join(body)))
        while self.cur is not None and self.is_label(self.cur, "EXTRA PRACTICAL"):
            title = re.sub(r"^EXTRA PRACTICAL\s*·?\s*", "", self.cur["t"]); self.i += 1
            w.setdefault("extraPracticals", []).append(
                dict(title=title, paras=paragraphs(self.take(lambda l: not self.label(l)), self.body)))
        if self.seek(lambda l: self.label(l) and "PRAYER" in l["t"] and not l["t"].startswith("EXTRA"), "DAILY PRAYER"):
            w["prayerLabel"] = self.cur["t"]
            self.i += 1
        prayer_lines = self.take(lambda l: not self.label(l))
        w["prayer"] = joined(prayer_lines)
        # Printed lines stay lines; prose that wraps to the margin is rejoined.
        out = []
        for l in prayer_lines:
            if out and prev_full:
                out[-1] += " " + l["t"]
            else:
                out.append(l["t"])
            # Wrapped prose: reached the margin mid-phrase. A printed line ends
            # with punctuation, however long it is.
            prev_full = l["x1"] >= l["right"] - 30 and re.search(r"[A-Za-z’']$", l["t"]) is not None
        w["prayerLines"] = out
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
        if k == len(block) and self.cur is not None and self.label(self.cur) and REF.search(self.cur["t"]):
            # A closing verse printed without quotation marks: the italic lines
            # right before its reference.
            while k and block[k - 1]["ital"] and not block[k - 1]["bold"]:
                k -= 1
        w["benediction"] = paragraphs(block[:k], self.body)
        closing = block[k:]
        w["closingVerse"] = unquote(joined(closing))
        w["closingIsPull"] = bool(closing) and all(self.pull(l) for l in closing)
        if self.cur is not None and self.label(self.cur) and REF.search(self.cur["t"]):
            w["closingRef"] = self.cur["t"]; self.i += 1
        elif not closing and self.cur is not None and self.label(self.cur) and self.cur["t"].startswith("—"):
            # Signed instead of closed with a verse (Prayer: "— THE SOUL DUST TEAM").
            w["closingSigned"] = True
            self.i += 1
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


# A part's own reference line: "Romans 5:18–19", "JOHN 16:12–15", "EXODUS 20".
PART_REF = re.compile(r"(?:[1-3]\s)?[A-Za-z]+(?:\s(?:of\s)?[A-Za-z]+)*\s+\d+"
                      r"(?::\d+(?:\s*[–-]\s*\d+(?::\d+)?)?)?(?:\s*[–-]\s*\d+)?")


def passage_parts(ref):
    """The parts a passage heading lists, each with its book:
    "John 15:26; 16:12–15; 1 Corinthians 12:3" -> ["John 15:26",
    "John 16:12–15", "1 Corinthians 12:3"]. One part for an ordinary passage."""
    out, book = [], None
    for item in re.split(r"\s*[;·]\s*", ref):
        item = item.strip()
        m = re.match(r"((?:[1-3]\s)?[A-Za-z]+(?:\s(?:of\s)?[A-Za-z]+)*)\s+(\d.*)", item)
        if m:
            book, rest = m[1], m[2]
        elif book and re.match(r"\d", item):
            rest = item
        else:
            continue
        # "14:15–17, 26" is two parts in one chapter: 14:15–17 and 14:26.
        chap = None
        for piece in re.split(r",\s*", rest):
            if ":" in piece:
                chap = piece.split(":")[0]
            elif chap is not None:
                piece = f"{chap}:{piece}"
            out.append(f"{book} {piece}")
    return out


def passage_in_parts(lines, parts, body, warn):
    """Read a gathered passage part by part. Each part's lines follow its
    own reference line; that line is matched to the heading's part with the
    same book (and chapter), so a part is read against its own range. The
    first verse of each part carries `ref` (the reader shows it as a
    heading); every verse carries `_b`, its book, until finish()."""
    groups = [[None, []]]
    for l in lines:
        t = l["t"].strip()
        if l["bold"] and PART_REF.fullmatch(t):
            groups.append([t, []])
        else:
            groups[-1][1].append(l)
    groups = [g for g in groups if g[1]]
    used, out = set(), []
    for label, glines in groups:
        part = None
        for i, cand in enumerate(parts):
            if i in used:
                continue
            if label is None or (book_of(cand) == book_of(label) and chapter_of(cand) == chapter_of(label)):
                part = i
                break
        if part is None:
            warn(f"passage part {label!r} isn't in the heading")
            continue
        used.add(part)
        vs = verses_from_lines(glines, parts[part], body, warn)
        if vs:
            vs[0]["ref"] = parts[part]
            for v in vs:
                v["_b"] = book_of(parts[part])
        out += vs
    if len(used) != len(parts):
        warn(f"passage: read {len(used)} of {len(parts)} parts")
    return out


def chapter_of(ref):
    m = re.search(r"\s(\d+)(?::|\s*$|\s*[–-])", ref.strip() + " ")
    return int(m[1]) if m else None


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
        # A verse from another book is printed at the station, not in the passage.
        mine = [v for v in w["passage"] if v.get("_b", book_of(w["passageRef"])) == book_of(st["ref"])
                and a and a <= (v["c"], v["n"]) <= b]
        st["verseNums"] = [f"{v['c']}:{v['n']}" for v in mine]
        st["anchor"] = find_anchor(st, mine)
        if st["anchor"] and any(v.get("ref") for v in w["passage"]):
            # A gathered passage can print the same chapter and verse twice
            # (John 3:5 and Titus 3:5): name the part the anchor is in.
            part = None
            for v in w["passage"]:
                part = v.get("ref") or part
                if v in mine and f"{v['c']}:{v['n']}" == st["anchor"]["v"]:
                    st["anchor"]["part"] = part
                    break
    for v in w["passage"]:
        v.pop("_b", None)
    beats = PRAYER.findall(w["prayer"])
    if len(beats) == 3:
        w["prayerLead"] = w["prayer"][: w["prayer"].index(beats[0][0] + ",")].strip()
        w["prayerBeats"] = [dict(person=p, verb=v, words=t) for p, v, t in beats]
        w["prayerClose"] = w["prayer"][w["prayer"].rindex("'") + 1:].strip()
    else:
        w["prayerLead"], w["prayerBeats"], w["prayerClose"] = "", [], ""
    return w


def check(w, warn):
    studied = sum(1 + len(st.get("moreStudies", [])) for st in w["stations"] if st.get("lang"))
    if studied != 5:
        warn(f"{studied} word studies")
    if len(w["stations"]) < 5:
        warn(f"{len(w['stations'])} stations")
    if len(w["practices"]) != 5:
        warn(f"{len(w['practices'])} practices")
    if len(w["study"]["parts"]) < 2:
        warn(f"{len(w['study']['parts'])} parts")
    if not w.get("closingRef") and not w.get("closingIsPull") and not w.get("closingSigned"):
        warn("empty closingRef")
    for k in ("title", "keyVerse", "keyRef", "lifeTitle", "prayer", "closingVerse", "carry"):
        if k == "closingVerse" and w.get("closingSigned"):
            continue
        if not w.get(k):
            warn(f"empty {k}")
    for k in ("bottomLine", "benediction"):
        if not w.get(k):
            warn(f"empty {k}")
    if w.get("hasPassage") and not w["passage"]:
        warn("empty passage")
    vs = [(v["c"], v["n"]) for v in w.get("passage", [])]
    starts = [bool(v.get("ref")) for v in w.get("passage", [])]
    for ((c0, n0), (c1, n1)), new_part in zip(zip(vs, vs[1:]), starts[1:]):
        if not new_part and not ((c1 == c0 and n1 == n0 + 1) or (c1 == c0 + 1 and n1 == 1)):
            warn(f"passage jumps from {c0}:{n0} to {c1}:{n1}")
    for st in w["stations"]:
        for k in ("verse", "question"):
            if not st.get(k):
                warn(f"station {st['ref']}: empty {k}")
        if st.get("lang"):
            if not st.get("greek") and st.get("lang") != "hebrew":
                warn(f"station {st['ref']}: empty greek")
            for k in ("translit", "live"):
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
    weekl = lambda l: re.fullmatch(r"WEEK\s*\d+(?:·[A-Z·\-]+)?", l["t"].replace(" ", ""))
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
