#!/usr/bin/env python3
"""Build the interactive Soul Dust study page from weeks.json.

Usage:
  python3 build_study.py weeks.json colossians.html --book Colossians \
      --accent "#B4531F" --accent-dark "#E07F48" [--web colossians.json] [--standalone]

- weeks.json comes from parse_study.py.
- The passage text for each week is filled in from the World English Bible.
  Pass --web with a local copy of the book's JSON from the `world-english-bible`
  npm package, or leave it off and the script downloads it from
  https://raw.githubusercontent.com/TehShrike/world-english-bible/master/json/<book>.json
- --standalone writes a full HTML document (doctype, head, body) for opening
  straight from your computer. Without it, the output is ready to publish as a
  Claude artifact.
- study_template.html must sit next to this script.
"""
import argparse, json, re, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
PRAYER = re.compile(r"(Father|Son|Spirit), ([^:']+): '(.*?)'(?= (?:Son|Spirit|Then)\b|\s*$)")


def load_web(book, path):
    if path:
        data = json.load(open(path))
    else:
        url = f"https://raw.githubusercontent.com/TehShrike/world-english-bible/master/json/{book.lower().replace(' ', '')}.json"
        data = json.load(urllib.request.urlopen(url))
    verses = {}
    for x in data:
        if x.get("type") in ("paragraph text", "line text") and x.get("verseNumber"):
            k = (x["chapterNumber"], x["verseNumber"])
            verses[k] = verses.get(k, "") + x["value"]
    return {k: re.sub(r"\s+", " ", v).strip() for k, v in verses.items()}


def parse_range(ref):
    """'Colossians 3:18–4:1' -> ((3,18),(4,1)); 'COLOSSIANS 1:7–8' -> ((1,7),(1,8))"""
    m = re.search(r"(\d+):(\d+)(?:[–-](?:(\d+):)?(\d+))?", ref)
    c1, v1 = int(m[1]), int(m[2])
    c2 = int(m[3]) if m[3] else c1
    v2 = int(m[4]) if m[4] else v1
    return (c1, v1), (c2, v2)


def verses_in(web, ref):
    a, b = parse_range(ref)
    return [dict(c=c, n=v, text=t) for (c, v), t in sorted(web.items()) if a <= (c, v) <= b]


STOP = set("to the a an of in on by with as be one that which another before for from its it is are and or not only while while".split())


def find_anchor(st, verses):
    """Pick the English word in the station's verses that the Greek word sits behind."""
    alts = [a.strip() for a in re.split(r"[,;—]", st["gloss"]) if a.strip()]
    words = []
    for a in alts:
        words += [w for w in re.findall(r"[a-z]+", a.lower()) if w not in STOP and len(w) >= 3]
    tokens = [(v, m) for v in verses for m in re.finditer(r"[A-Za-z’']+", v["text"])]
    def stem(w):
        w = w.lower().strip("’'")
        for suf in ("ing", "ed", "es", "s", "ness", "ly"):
            if w.endswith(suf) and len(w) - len(suf) >= 4:
                return w[: -len(suf)][:6]
        return w[:6]
    for cand in words:
        cs = stem(cand)
        for v, m in tokens:
            if stem(m.group()) == cs:
                return dict(v=f"{v['c']}:{v['n']}", word=m.group())
    return None


def enrich(weeks, web):
    for w in weeks:
        w["passage"] = verses_in(web, w["passageRef"])
        if not w["passage"]:
            raise SystemExit(f"Week {w['week']}: no WEB verses found for {w['passageRef']}")
        for st in w["stations"]:
            a, b = parse_range(st["ref"])
            st["verseNums"] = [f"{c}:{v}" for (c, v) in sorted(web) if a <= (c, v) <= b]
            st["anchor"] = find_anchor(st, [v for v in w["passage"] if f"{v['c']}:{v['n']}" in st["verseNums"]])
        beats = PRAYER.findall(w["prayer"])
        if len(beats) == 3:
            w["prayerLead"] = w["prayer"][: w["prayer"].index(beats[0][0] + ",")].strip()
            w["prayerBeats"] = [dict(person=p, verb=v, words=t) for p, v, t in beats]
            w["prayerClose"] = w["prayer"][w["prayer"].rindex("'") + 1:].strip()
    return weeks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("weeks"); ap.add_argument("out")
    ap.add_argument("--book", default="Colossians")
    ap.add_argument("--accent", default="#B4531F")
    ap.add_argument("--accent-dark", default="#E07F48")
    ap.add_argument("--web")
    ap.add_argument("--footer", default="")
    ap.add_argument("--standalone", action="store_true")
    a = ap.parse_args()

    weeks = enrich(json.load(open(a.weeks)), load_web(a.book, a.web))
    footer = a.footer or f"Soul Dust Revival: {a.book} (WEB version). Scripture from the World English Bible (public domain); Psalm 119:25 from the NKJV."
    data = dict(meta=dict(book=a.book, prefix=f"sdr-{a.book.lower().replace(' ', '')}-", footer=footer), weeks=weeks)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    html = (HERE / "study_template.html").read_text()
    html = (html.replace("__TITLE__", f"Soul Dust {a.book}")
                .replace("__ACCENT__", a.accent).replace("__ACCENT_DARK__", a.accent_dark)
                .replace("__DATA__", payload))
    if a.standalone:
        head, body = html.split("</style>", 1)
        html = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
                '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                + head + "</style>\n</head>\n<body>" + body + "\n</body>\n</html>\n")
    Path(a.out).write_text(html)
    print(f"Wrote {a.out}: {len(weeks)} weeks, {len(html)//1024} KB")


if __name__ == "__main__":
    main()
