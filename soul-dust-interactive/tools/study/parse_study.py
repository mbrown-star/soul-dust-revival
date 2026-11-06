#!/usr/bin/env python3
"""Parse a Soul Dust Revival 12-week study PDF (Colossians format) into weeks.json.

Usage:  python3 parse_study.py "Soul_Dust_Revival_Colossians WEB version.pdf" weeks.json

Reads the typeset PDF with pdfplumber and uses the font size and weight of each
line to tell the sections apart. It expects the Colossians layout:
week opener, SCRIPTURE STUDY · DIVE, THE PASSAGE, five verse stations
(QUESTION / GOING DEEPER · THE GREEK / LIVE IT), LIFE APPLICATION, DAILY PRAYER,
BOTTOM LINE, BENEDICTION, closing verse, QUIET QUESTION TO CARRY, END OF WEEK.
The passage text itself is not read from the PDF (verse numbers are set as
superscripts); build_study.py fills it in from the WEB.
"""
import json, re, sys
import pdfplumber

ROMAN = re.compile(r"^[IVXL]+$")


def load_lines(path):
    out = []
    with pdfplumber.open(path) as pdf:
        for pi, pg in enumerate(pdf.pages):
            for l in pg.extract_text_lines():
                c = l["chars"][0]
                size = round(c["size"], 1)
                font = c["fontname"].split("+")[-1]
                t = l["text"].strip()
                if not t:
                    continue
                # running headers, pull-quote attributions, page numbers
                if size == 6.5 and t.startswith("SOUL DUST REVIVAL"):
                    continue
                if l["top"] > 600 and re.fullmatch(r"\d+", t):
                    continue
                out.append(dict(t=t, page=pi, top=l["top"], x0=l["x0"], x1=l["x1"], size=size,
                                bold="Bold" in font, ital="Italic" in font or "BoldIt" in font,
                                sym="DejaVu" in font))
    return out


def kind(l):
    s, b, i = l["size"], l["bold"], l["ital"]
    if l["sym"]:
        return "sym"
    if s == 40.0:
        return "roman"
    if s == 23.0:
        return "title"
    if s == 19.0:
        return "h1"
    if s == 15.0 and b:
        return "greek"
    if s == 12.5 and b and i:
        return "pull"
    if s == 12.5 and b:
        return "h3"
    if s == 12.5 and i:
        return "subtitle"
    if s in (7.0, 7.5, 6.8, 8.0, 8.5) and b and (l["t"].isupper() or l["t"].startswith("PART ")) or (s == 8.0 and b):
        return "label"
    if l["t"].startswith("LIVE IT:"):
        return "liveit"
    if s == 10.5 and b and re.match(r"^\d+\. ", l["t"]):
        return "practice"
    if s == 8.0 and not b:
        return "xref"
    return "text"


def paragraphs(lines):
    """Join lines into paragraphs using vertical gaps (and page breaks)."""
    paras, prev = [], None
    for l in lines:
        new = prev is None
        if prev is not None:
            if l["page"] != prev["page"]:
                new = prev["x1"] < 385 and prev["t"][-1:] in ".?!”’\"'"
            else:
                new = (l["top"] - prev["top"]) > l["size"] * 1.85
        if new:
            paras.append(l["t"])
        else:
            paras[-1] += " " + l["t"]
        prev = l
    return [re.sub(r"\s+", " ", p).strip() for p in paras]


def joined(lines):
    return re.sub(r"\s+", " ", " ".join(l["t"] for l in lines)).strip()


def unquote(s):
    return s.strip().strip("“”\"").strip()


def parse_week(L):
    w = dict(study=dict(sections=[], parts=[]), stations=[], practices=[])
    i = 0
    n = len(L)

    def take(pred):
        nonlocal i
        got = []
        while i < n and pred(L[i]):
            got.append(L[i]); i += 1
        return got

    # opener
    while kind(L[i]) != "label" or not L[i]["t"].startswith("WEEK"):
        i += 1
    w["week"] = int(L[i]["t"].split()[1]); i += 1
    w["title"] = joined(take(lambda l: kind(l) == "title"))
    w["subtitle"] = joined(take(lambda l: kind(l) == "subtitle"))
    take(lambda l: kind(l) == "sym")
    w["keyVerse"] = unquote(joined(take(lambda l: kind(l) == "text" and l["ital"] and l["size"] == 11.0)))
    w["keyRef"] = L[i]["t"]; i += 1

    # skip to study dive
    while not (kind(L[i]) == "label" and "SCRIPTURE STUDY" in L[i]["t"]):
        i += 1
    i += 1
    take(lambda l: kind(l) == "h1")
    take(lambda l: kind(l) == "text" and l["size"] == 11.0)
    i += 1  # verse ref label

    cur, buf, pulls = None, [], []

    def flush():
        if cur is not None:
            cur["paras"] = paragraphs(buf)

    while i < n and not (kind(L[i]) == "label" and L[i]["t"] == "THE PASSAGE"):
        l, k = L[i], kind(L[i])
        if k == "h3" or (k == "label" and l["t"].startswith("PART ")):
            flush(); buf = []
            if k == "h3":
                cur = dict(heading=l["t"]); w["study"]["sections"].append(cur)
            else:
                m = re.match(r"PART (\w+) — (.+)", l["t"])
                cur = dict(label="PART " + m[1], heading=m[2]); w["study"]["parts"].append(cur)
            i += 1
            # headings can wrap
            while i < n and kind(L[i]) == k and L[i]["top"] - L[i - 1]["top"] < 20:
                cur["heading"] += " " + L[i]["t"]; i += 1
            continue
        if k == "pull":
            q = take(lambda x: kind(x) == "pull")
            cur.setdefault("pulls", []).append(unquote(joined(q)))
            continue
        if k == "text":
            buf.append(l)
        i += 1
    flush()

    # passage: only the reference
    i += 1
    w["passageRef"] = L[i]["t"]
    while not (kind(L[i]) == "label" and L[i]["t"].startswith("THE WORD ON")):
        i += 1
    w["stationsLabel"] = L[i]["t"]; i += 1
    take(lambda l: kind(l) == "h1")
    w["stationsIntro"] = joined(take(lambda l: kind(l) == "text" and l["ital"]))

    # stations
    while i < n and not (kind(L[i]) == "label" and L[i]["t"].startswith("LIFE APPLICATION")):
        st = dict(ref=L[i]["t"]); i += 1
        st["verse"] = unquote(joined(take(lambda l: kind(l) == "text")))
        i += 1  # QUESTION
        st["question"] = joined(take(lambda l: kind(l) == "text"))
        i += 1  # GOING DEEPER
        st["greek"] = joined(take(lambda l: kind(l) == "greek"))
        tl = joined(take(lambda l: kind(l) == "text" and l["ital"] and l["size"] == 10.5))
        parts = [p.strip() for p in tl.split(" — ", 1)]
        st["translit"], st["gloss"] = parts[0], (parts[1] if len(parts) > 1 else "")
        st["xref"] = joined(take(lambda l: kind(l) == "xref"))
        st["body"] = paragraphs(take(lambda l: kind(l) == "text" and not l["ital"]))
        lv = take(lambda l: kind(l) in ("liveit", "text"))
        st["live"] = re.sub(r"^LIVE IT:\s*", "", joined(lv))
        w["stations"].append(st)

    # life application
    i += 1
    w["lifeTitle"] = joined(take(lambda l: kind(l) == "h1"))
    w["lifeIntro"] = joined(take(lambda l: kind(l) == "text" and l["ital"]))
    while kind(L[i]) == "practice":
        m = re.match(r"(\d+)\. (.+)", L[i]["t"]); i += 1
        body = joined(take(lambda l: kind(l) == "text" and not l["ital"]))
        w["practices"].append(dict(n=int(m[1]), title=m[2], body=body))
    take(lambda l: kind(l) == "sym")
    i += 1  # DAILY PRAYER
    w["prayer"] = joined(take(lambda l: kind(l) == "text"))
    i += 1  # BOTTOM LINE
    w["bottomLine"] = paragraphs(take(lambda l: kind(l) == "text"))

    # benediction
    i += 1
    take(lambda l: kind(l) == "h1")
    w["benediction"] = paragraphs(take(lambda l: kind(l) == "text" and l["size"] == 10.5))
    take(lambda l: kind(l) == "sym")
    w["closingVerse"] = unquote(joined(take(lambda l: kind(l) == "text")))
    w["closingRef"] = L[i]["t"]; i += 2
    w["carry"] = joined(take(lambda l: kind(l) == "text"))
    return w


def main(pdf_path, out_path):
    L = load_lines(pdf_path)
    starts = [j for j, l in enumerate(L) if kind(l) == "roman" and ROMAN.match(l["t"])
              and j + 1 < len(L) and L[j + 1]["t"].startswith("WEEK ")]
    weeks = []
    for a, s in enumerate(starts):
        e = starts[a + 1] if a + 1 < len(starts) else len(L)
        weeks.append(parse_week(L[s:e]))
    json.dump(weeks, open(out_path, "w"), ensure_ascii=False, indent=1)
    for w in weeks:
        print(f"Week {w['week']:>2}: {w['title']} | {w['passageRef']} | sections {len(w['study']['sections'])}, "
              f"parts {len(w['study']['parts'])}, stations {len(w['stations'])}, practices {len(w['practices'])}, "
              f"benediction ¶ {len(w['benediction'])}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
