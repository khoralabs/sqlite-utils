#!/usr/bin/env bun
/**
 * Stage a standalone npm package under release/<name>/ (outside Bun workspaces).
 * Publish from that directory.
 */

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

export const RELEASE_PACKAGES = ["sqlite-migrate", "sqlite-crypto"] as const;
export type ReleasePackage = (typeof RELEASE_PACKAGES)[number];

export function isReleasePackage(name: string): name is ReleasePackage {
  return (RELEASE_PACKAGES as readonly string[]).includes(name);
}

export type StageSqliteReleaseOptions = {
  workspaceRoot: string;
  packageName: ReleasePackage;
  version: string;
};

export type StageSqliteReleaseResult = {
  releaseDir: string;
  packageName: ReleasePackage;
};

export async function stageSqliteRelease(
  opts: StageSqliteReleaseOptions,
): Promise<StageSqliteReleaseResult> {
  const { workspaceRoot, packageName, version } = opts;
  const pkgDir = path.join(workspaceRoot, "packages", packageName);
  const pkgJsonPath = path.join(pkgDir, "package.json");

  if (!existsSync(pkgJsonPath)) {
    throw new Error(`missing package at ${pkgDir}`);
  }

  const source = JSON.parse(await Bun.file(pkgJsonPath).text()) as Record<string, unknown>;
  const releaseDir = path.join(workspaceRoot, "release", packageName);

  if (existsSync(releaseDir)) rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(releaseDir, { recursive: true });

  cpSync(path.join(pkgDir, "src"), path.join(releaseDir, "src"), { recursive: true });

  const readmePath = path.join(pkgDir, "README.md");
  if (existsSync(readmePath)) {
    cpSync(readmePath, path.join(releaseDir, "README.md"));
  }

  const licensePath = path.join(pkgDir, "LICENSE");
  if (existsSync(licensePath)) {
    cpSync(licensePath, path.join(releaseDir, "LICENSE"));
  }

  const staged: Record<string, unknown> = {
    name: source.name,
    version,
    description: source.description,
    license: source.license ?? "MIT",
    type: source.type ?? "module",
    files: source.files ?? ["src", "LICENSE"],
    repository: source.repository,
    exports: source.exports,
    publishConfig: { access: "public" },
  };

  await Bun.write(path.join(releaseDir, "package.json"), `${JSON.stringify(staged, null, 2)}\n`);

  return { releaseDir, packageName };
}

if (import.meta.main) {
  const packageName = process.argv[2];
  const version = process.argv[3];
  if (!packageName || !isReleasePackage(packageName)) {
    console.error("usage: stage-sqlite-release.ts <sqlite-migrate|sqlite-crypto> <semver>");
    process.exit(1);
  }
  if (!version || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version)) {
    console.error("invalid semver:", version);
    process.exit(1);
  }
  const workspaceRoot = path.resolve(import.meta.dir, "..");
  const result = await stageSqliteRelease({ workspaceRoot, packageName, version });
  console.log(`staged ${result.packageName} → ${path.relative(workspaceRoot, result.releaseDir)}`);
}
