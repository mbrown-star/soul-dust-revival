#!/usr/bin/env python3
"""Build the interactive 365-day devotional page from days.json.

Usage:
  python3 build_devotional.py days.json psalms-365.html [--web psalms.json] [--standalone]

- days.json comes from parse_devotional.py.
- The full WEB psalm text (opened from each day's "Read Psalm ..." link) comes
  from the world-english-bible package's psalms.json. Pass --web with a local
  copy, or leave it off to download it from
  https://raw.githubusercontent.com/TehShrike/world-english-bible/master/json/psalms.json
- --standalone writes a full HTML document for opening from your computer.
  Without it, the output is ready to publish as a Claude artifact.
- devotional_template.html must sit next to this script.
"""
import argparse, json, re, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load_psalms(path):
    if path:
        src = json.load(open(path))
    else:
        src = json.load(urllib.request.urlopen(
            "https://raw.githubusercontent.com/TehShrike/world-english-bible/master/json/psalms.json"))
    ps = {}
    for x in src:
        if x.get("type") in ("paragraph text", "line text") and x.get("verseNumber"):
            ch = ps.setdefault(x["chapterNumber"], {})
            ch[x["verseNumber"]] = ch.get(x["verseNumber"], "") + x["value"]
    return {c: [re.sub(r"\s+", " ", ps[c][v]).strip() for v in sorted(ps[c])] for c in sorted(ps)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("days"); ap.add_argument("out")
    ap.add_argument("--web")
    ap.add_argument("--standalone", action="store_true")
    a = ap.parse_args()

    days = json.load(open(a.days))
    ps = load_psalms(a.web)
    enc = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = (HERE / "devotional_template.html").read_text()
    html = html.replace("__DAYS__", enc(days)).replace("__PSALMS__", enc(ps))
    if a.standalone:
        head, body = html.split("</style>", 1)
        html = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
                '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                + head + "</style>\n</head>\n<body>" + body + "\n</body>\n</html>\n")
    Path(a.out).write_text(html)
    print(f"Wrote {a.out}: {len(days)} days, {len(html)//1024} KB")


if __name__ == "__main__":
    main()
