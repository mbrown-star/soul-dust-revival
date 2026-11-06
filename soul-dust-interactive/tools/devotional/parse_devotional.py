#!/usr/bin/env python3
"""Parse the Soul Dust Revival 365-day Psalms devotional PDF into days.json.

Usage:  python3 parse_devotional.py devotional.pdf days.json [--first-page 9]

Each day in the book follows the same pattern:
    DAY n · MONTH D · PSALM ref        (bold header)
    Title                              (bold, may wrap)
    “Key verse”                        (italic)
    — PSALM ref                        (key verse reference)
    reading paragraphs                 (body text)
    LIFT UP YOUR EYES                  (bold label) + italic text
    A QUESTION TO SIT WITH             (bold label) + italic text

Paragraph breaks come from vertical gaps between lines (a normal line step is
about 12pt and a paragraph gap about 16pt). Running headers (top < 40pt) and
page numbers (top > 600pt) are skipped. --first-page is the 1-based page where
Day 1 starts, so the front matter is ignored.

Output fields per day: d (day number), dt (date), r (psalm reference),
t (title), kv (key verse), kr (key verse reference), p (reading paragraphs),
l (Lift Up Your Eyes), q (question).
"""
import argparse, collections, json, re
import pdfplumber

HDR = re.compile(r"^DAY (\d+) · ([A-Z]+ \d+) · (.+)$")
LABELS = {"LIFT UP YOUR EYES": "lift", "A QUESTION TO SIT WITH": "q"}


def load_lines(path, first_page):
    lines = []
    with pdfplumber.open(path) as pdf:
        for pi, pg in enumerate(pdf.pages[first_page - 1:]):
            first = True
            for l in pg.extract_text_lines():
                if l["top"] < 40 or l["top"] > 600:
                    continue
                f = l["chars"][0]["fontname"]
                lines.append(dict(t=l["text"].strip(), top=l["top"], x1=l["x1"], page=pi,
                                  bold="Bold" in f, first=first))
                first = False
    return lines


def parse(lines):
    days, cur = [], None
    for l in lines:
        m = HDR.match(l["t"])
        if m:
            cur = dict(day=int(m[1]), date=m[2].title(),
                       ref=m[3].replace("PSALM", "Psalm").replace("(VV.", "(vv."), lines=[])
            days.append(cur)
        elif cur is not None:
            cur["lines"].append(l)

    out = []
    for d in days:
        L = d["lines"]
        i, title = 0, []
        while L[i]["bold"]:
            title.append(L[i]["t"]); i += 1
        kv = []
        while not L[i]["t"].startswith("— "):
            kv.append(L[i]["t"]); i += 1
        kref = L[i]["t"][2:].replace("PSALM", "Psalm"); i += 1

        sec = {"read": [], "lift": [], "q": []}
        s, last = "read", None
        for l in L[i:]:
            if l["bold"] and l["t"] in LABELS:
                s, last = LABELS[l["t"]], None
                continue
            if l["bold"] and re.fullmatch(r"[A-Z][a-z]+", l["t"]):  # month divider word
                continue
            if last is None:
                new = True
            elif l["page"] != last["page"]:
                new = last["x1"] < 380          # a full-width line continues onto the next page
            else:
                new = l["top"] - last["top"] > 14.5
            if new:
                sec[s].append(l["t"])
            else:
                sec[s][-1] += " " + l["t"]
            last = l
        out.append(dict(d=d["day"], dt=d["date"], r=d["ref"], t=" ".join(title),
                        kv=" ".join(kv).strip("“”"), kr=kref,
                        p=sec["read"], l=" ".join(sec["lift"]), q=" ".join(sec["q"])))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf"); ap.add_argument("out")
    ap.add_argument("--first-page", type=int, default=9)
    a = ap.parse_args()
    days = parse(load_lines(a.pdf, a.first_page))
    json.dump(days, open(a.out, "w"), ensure_ascii=False, indent=1)
    print(f"{len(days)} days parsed")
    print("paragraphs per day:", dict(collections.Counter(len(o["p"]) for o in days)))
    bad = [o["d"] for o in days if not (o["t"] and o["kv"] and o["l"] and o["q"])]
    print("days missing a part:", bad or "none")


if __name__ == "__main__":
    main()
