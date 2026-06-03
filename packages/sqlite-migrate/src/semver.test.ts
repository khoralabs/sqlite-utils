import { describe, expect, test } from "bun:test";
import { compareSemver, encodeSemverForUserVersion, parseSemver } from "./semver";

describe("parseSemver", () => {
  test("parses MAJOR.MINOR.PATCH", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver("0.0.0")).toEqual({ major: 0, minor: 0, patch: 0 });
  });

  test("rejects pre-release, build metadata, and malformed strings", () => {
    for (const bad of ["1.2", "1.2.3.4", "v1.2.3", "1.2.3-beta", "1.2.3+build", ""]) {
      expect(() => parseSemver(bad)).toThrow(/Invalid semver/);
    }
  });
});

describe("compareSemver", () => {
  test("orders versions lexicographically by component", () => {
    expect(compareSemver("1.0.0", "2.0.0")).toBeLessThan(0);
    expect(compareSemver("1.2.0", "1.10.0")).toBeLessThan(0);
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
    expect(compareSemver("2.0.0", "1.9.9")).toBeGreaterThan(0);
  });
});

describe("encodeSemverForUserVersion", () => {
  test("encodes semver into PRAGMA user_version layout", () => {
    expect(encodeSemverForUserVersion("0.3.0")).toBe(3_000);
    expect(encodeSemverForUserVersion("1.2.3")).toBe(1_002_003);
  });

  test("rejects components above 999", () => {
    expect(() => encodeSemverForUserVersion("1000.0.0")).toThrow(/exceeds 999/);
    expect(() => encodeSemverForUserVersion("0.1000.0")).toThrow(/exceeds 999/);
    expect(() => encodeSemverForUserVersion("0.0.1000")).toThrow(/exceeds 999/);
  });
});
