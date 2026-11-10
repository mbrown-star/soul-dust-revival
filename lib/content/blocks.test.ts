import { describe, expect, it } from "vitest";
import { trackUrlForCaptions } from "./blocks";

const base = "https://pub-abc.r2.dev";
const file = "11111111-1111-4111-8111-111111111111.vtt";

describe("trackUrlForCaptions", () => {
  it("serves an uploaded captions file from the app's own origin", () => {
    expect(trackUrlForCaptions(`${base}/captions/${file}`, base)).toBe(`/api/captions/${file}`);
    expect(trackUrlForCaptions(`${base}/captions/${file}`, `${base}/`)).toBe(`/api/captions/${file}`);
  });

  it("leaves anything that isn't an uploaded captions file unchanged", () => {
    for (const url of [
      "https://elsewhere.example/captions/a.vtt",
      `${base}/content/${file}`,
      `${base}/captions/../secret.vtt`,
      `${base}/captions/not-a-uuid.vtt`,
    ]) {
      expect(trackUrlForCaptions(url, base)).toBe(url);
    }
    expect(trackUrlForCaptions(`${base}/captions/${file}`, undefined)).toBe(`${base}/captions/${file}`);
  });
});
