// Checks the summary lines soul-dust-interactive/build.sh prints, as written
// by tools/study/parse_study.py and tools/devotional/parse_devotional.py:
//
//   Week  1: <title> | <ref> | sections 2, parts 4, stations 5, practices 5, benediction ¶ 3
//   365 days parsed
//   paragraphs per day: {4: 365}
//   days missing a part: none
//
// Rules from soul-dust-interactive/CLAUDE.md ("Working conventions").

const EXPECTED_WEEK = { sections: 2, parts: 4, stations: 5, practices: 5, benediction: 3 };
const DAYS = 365;
const PARAGRAPHS = 4;

const WEEK_RE =
  /^Week\s+(\d+):.*\| sections (\d+), parts (\d+), stations (\d+), practices (\d+), benediction ¶ (\d+)\s*$/;

/** Returns the lines that fail the rules (empty when the build is good). */
export function checkBuildSummary(output) {
  const lines = output.split(/\r?\n/);
  const failures = [];

  const weeks = lines.filter((l) => /^Week\s+\d+:/.test(l));
  if (weeks.length === 0) failures.push("no study week summary lines (expected `Week N: ... | sections 2, parts 4, ...`)");
  for (const line of weeks) {
    const m = line.match(WEEK_RE);
    if (!m) {
      failures.push(`unrecognised week line: ${line}`);
      continue;
    }
    const [sections, parts, stations, practices, benediction] = m.slice(2).map(Number);
    const got = { sections, parts, stations, practices, benediction };
    const bad = Object.entries(EXPECTED_WEEK).filter(([k, v]) => got[k] !== v);
    if (bad.length) failures.push(`${line.trim()}  <- expected ${bad.map(([k, v]) => `${k} ${v}`).join(", ")}`);
  }

  const daysLine = lines.find((l) => /^\d+ days parsed\s*$/.test(l));
  if (!daysLine) failures.push("missing `N days parsed` line from the devotional parser");
  else if (Number.parseInt(daysLine, 10) !== DAYS) failures.push(`${daysLine.trim()}  <- expected ${DAYS}`);

  const paraLine = lines.find((l) => l.startsWith("paragraphs per day:"));
  if (!paraLine) failures.push("missing `paragraphs per day:` line");
  else {
    const counts = [...paraLine.matchAll(/(\d+):\s*(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const ok = counts.length === 1 && counts[0]?.[0] === PARAGRAPHS && counts[0]?.[1] === DAYS;
    if (!ok) failures.push(`${paraLine.trim()}  <- expected {${PARAGRAPHS}: ${DAYS}}`);
  }

  const missingLine = lines.find((l) => l.startsWith("days missing a part:"));
  if (!missingLine) failures.push("missing `days missing a part:` line");
  else if (missingLine.trim() !== "days missing a part: none") failures.push(`${missingLine.trim()}  <- expected none`);

  return failures;
}
