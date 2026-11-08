import { describe, expect, it } from "vitest";
import { parseSessionTokensFromHash } from "./sessionHashTokens";

describe("parseSessionTokensFromHash", () => {
  it("extracts both tokens from a real implicit-flow fragment", () => {
    const hash =
      "#access_token=eyJhbGciOi.payload.sig&expires_at=1794175873&expires_in=3600&refresh_token=vm43nbqewgbb&token_type=bearer&type=magiclink";
    expect(parseSessionTokensFromHash(hash)).toEqual({
      accessToken: "eyJhbGciOi.payload.sig",
      refreshToken: "vm43nbqewgbb",
    });
  });

  it("works whether or not the leading # is included", () => {
    const withoutHash = "access_token=abc&refresh_token=def";
    expect(parseSessionTokensFromHash(withoutHash)).toEqual({
      accessToken: "abc",
      refreshToken: "def",
    });
  });

  it("returns null for an ordinary anchor-link hash", () => {
    expect(parseSessionTokensFromHash("#main-content")).toBeNull();
    expect(parseSessionTokensFromHash("")).toBeNull();
  });

  it("returns null when only one of the two tokens is present", () => {
    expect(parseSessionTokensFromHash("#access_token=abc")).toBeNull();
    expect(parseSessionTokensFromHash("#refresh_token=def")).toBeNull();
  });

  it("returns null when a token key is present but its value is empty", () => {
    expect(parseSessionTokensFromHash("#access_token=&refresh_token=")).toBeNull();
  });
});
