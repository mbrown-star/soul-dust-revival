#!/usr/bin/env bash
# Rebuild everything in dist/ from the PDFs in source/.
# Needs Python 3 and pdfplumber:  pip install -r requirements.txt
set -euo pipefail
cd "$(dirname "$0")"

echo "== Colossians (12-week study) =="
python3 tools/study/parse_study.py source/Soul_Dust_Revival_Colossians_WEB_version.pdf data/colossians-weeks.json
python3 tools/study/build_study.py data/colossians-weeks.json dist/colossians.html \
  --book Colossians --accent "#B4531F" --accent-dark "#E07F48" \
  --web data/web/colossians.json --standalone
python3 tools/study/build_study.py data/colossians-weeks.json dist/artifact/colossians.html \
  --book Colossians --accent "#B4531F" --accent-dark "#E07F48" \
  --web data/web/colossians.json

echo "== Psalms (365-day devotional) =="
python3 tools/devotional/parse_devotional.py source/Soul_Dust_Revival_Psalms_365_Universal_WEB_version.pdf data/psalms-365-days.json
python3 tools/devotional/build_devotional.py data/psalms-365-days.json dist/psalms-365.html \
  --web data/web/psalms.json --standalone
python3 tools/devotional/build_devotional.py data/psalms-365-days.json dist/artifact/psalms-365.html \
  --web data/web/psalms.json

echo "Done. Open dist/colossians.html and dist/psalms-365.html in a browser."
