export interface Semver {
  major: number;
  minor: number;
  patch: number;
}

/** Parse a `MAJOR.MINOR.PATCH` semver. Throws on malformed input. Pre-release / build metadata are not supported. */
export function parseSemver(input: string): Semver {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(input);
  if (match === null) {
    throw new Error(`Invalid semver: ${JSON.stringify(input)} (expected MAJOR.MINOR.PATCH)`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** Standard semver comparator. Negative if `a < b`, positive if `a > b`, 0 if equal. */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

/**
 * Encode a semver as an integer suitable for `PRAGMA user_version`.
 * Layout: `major * 1_000_000 + minor * 1_000 + patch`. Caps each component at 999.
 */
export function encodeSemverForUserVersion(version: string): number {
  const { major, minor, patch } = parseSemver(version);
  if (major > 999 || minor > 999 || patch > 999) {
    throw new Error(`Semver component exceeds 999 in ${JSON.stringify(version)}`);
  }
  return major * 1_000_000 + minor * 1_000 + patch;
}
