import type { Database } from "bun:sqlite";
import type { AppliedMigration, Migration, MigrationResult } from "./migration";
import { compareSemver, encodeSemverForUserVersion } from "./semver";

const DEFAULT_TABLE = "_schema_migrations";

export interface MigrationRunner {
  run(db: Database, migrations: readonly Migration[]): Promise<MigrationResult>;
  /**
   * Synchronous variant of {@link MigrationRunner.run}. Use when every migration's `up()` is
   * synchronous (the common case for `bun:sqlite`, whose API is itself synchronous). Throws if
   * an `up()` returns a Promise — promote to {@link MigrationRunner.run} in that case.
   */
  runSync(db: Database, migrations: readonly Migration[]): MigrationResult;
}

export interface CreateMigrationRunnerOptions {
  /** Tracking table name. Defaults to `_schema_migrations`. Must be a valid SQL identifier. */
  tableName?: string;
}

/**
 * Build a runner that applies pending migrations in `(from, to, name)` semver order.
 * Each migration runs in its own transaction; failures roll back and stop the run.
 */
export function createMigrationRunner(opts: CreateMigrationRunnerOptions = {}): MigrationRunner {
  const tableName = opts.tableName ?? DEFAULT_TABLE;
  assertSafeIdentifier(tableName);

  return {
    async run(db, migrations) {
      const plan = prepareRun(db, tableName, migrations);
      for (const m of plan.pending) {
        await applyOne(db, tableName, m, plan.applied);
      }
      finalize(db, plan);
      return plan.result;
    },

    runSync(db, migrations) {
      const plan = prepareRun(db, tableName, migrations);
      for (const m of plan.pending) {
        applyOneSync(db, tableName, m, plan.applied);
      }
      finalize(db, plan);
      return plan.result;
    },
  };
}

interface RunPlan {
  pending: Migration[];
  applied: AppliedMigration[];
  result: MigrationResult;
}

function prepareRun(db: Database, tableName: string, migrations: readonly Migration[]): RunPlan {
  ensureTrackingTable(db, tableName);
  const ordered = sortMigrations(migrations);
  const appliedSet = readAppliedSet(db, tableName);

  const pending: Migration[] = [];
  const applied: AppliedMigration[] = [];
  const skipped: AppliedMigration[] = [];

  for (const m of ordered) {
    const existing = appliedSet.get(trackingKey(m));
    if (existing !== undefined) {
      skipped.push(existing);
    } else {
      pending.push(m);
    }
  }

  return {
    pending,
    applied,
    result: { applied, skipped, finalVersion: null },
  };
}

async function applyOne(
  db: Database,
  tableName: string,
  m: Migration,
  applied: AppliedMigration[],
): Promise<void> {
  const appliedAt = Date.now();
  db.run("BEGIN");
  try {
    await m.up(db);
    insertTrackingRow(db, tableName, m, appliedAt);
    db.run("COMMIT");
  } catch (err) {
    safeRollback(db);
    throw err;
  }
  applied.push({ from: m.from, to: m.to, name: m.name, appliedAt });
  syncUserVersion(db, applied);
}

function applyOneSync(
  db: Database,
  tableName: string,
  m: Migration,
  applied: AppliedMigration[],
): void {
  const appliedAt = Date.now();
  db.run("BEGIN");
  try {
    const ret = m.up(db);
    if (ret !== undefined && typeof (ret as Promise<unknown>).then === "function") {
      safeRollback(db);
      throw new Error(
        `runSync requires synchronous up(); migration ${JSON.stringify(`${m.from}->${m.to}:${m.name}`)} returned a Promise`,
      );
    }
    insertTrackingRow(db, tableName, m, appliedAt);
    db.run("COMMIT");
  } catch (err) {
    safeRollback(db);
    throw err;
  }
  applied.push({ from: m.from, to: m.to, name: m.name, appliedAt });
  syncUserVersion(db, applied);
}

function syncUserVersion(db: Database, applied: AppliedMigration[]): void {
  const version = highestTo(applied);
  if (version !== null) {
    db.run(`PRAGMA user_version = ${encodeSemverForUserVersion(version)}`);
  }
}

function insertTrackingRow(db: Database, tableName: string, m: Migration, appliedAt: number): void {
  db.run(
    `INSERT INTO "${tableName}" (from_version, to_version, name, applied_at) VALUES (?, ?, ?, ?)`,
    [m.from, m.to, m.name, appliedAt],
  );
}

function safeRollback(db: Database): void {
  try {
    db.run("ROLLBACK");
  } catch {
    /* best effort */
  }
}

function finalize(_db: Database, plan: RunPlan): void {
  const { applied, skipped } = plan.result;
  const finalVersion =
    applied.length > 0 ? highestTo(applied) : skipped.length > 0 ? highestTo(skipped) : null;
  plan.result.finalVersion = finalVersion;
}

function ensureTrackingTable(db: Database, tableName: string): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS "${tableName}" (
      from_version TEXT NOT NULL,
      to_version   TEXT NOT NULL,
      name         TEXT NOT NULL,
      applied_at   INTEGER NOT NULL,
      PRIMARY KEY (from_version, to_version, name)
    )`,
  );
}

function readAppliedSet(db: Database, tableName: string): Map<string, AppliedMigration> {
  const rows = db
    .query<{ from_version: string; to_version: string; name: string; applied_at: number }, []>(
      `SELECT from_version, to_version, name, applied_at FROM "${tableName}"`,
    )
    .all();
  const out = new Map<string, AppliedMigration>();
  for (const r of rows) {
    out.set(trackingKey({ from: r.from_version, to: r.to_version, name: r.name }), {
      from: r.from_version,
      to: r.to_version,
      name: r.name,
      appliedAt: r.applied_at,
    });
  }
  return out;
}

function sortMigrations(migrations: readonly Migration[]): Migration[] {
  const seen = new Set<string>();
  const ordered: Migration[] = [];
  for (const m of [...migrations].sort(compareMigrations)) {
    const key = trackingKey(m);
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(m);
  }
  return ordered;
}

function compareMigrations(a: Migration, b: Migration): number {
  const fromCmp = compareSemver(a.from, b.from);
  if (fromCmp !== 0) return fromCmp;
  const toCmp = compareSemver(a.to, b.to);
  if (toCmp !== 0) return toCmp;
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}

function highestTo(items: readonly { to: string }[]): string | null {
  let best: string | null = null;
  for (const m of items) {
    if (best === null || compareSemver(m.to, best) > 0) {
      best = m.to;
    }
  }
  return best;
}

function trackingKey(m: Pick<Migration, "from" | "to" | "name">): string {
  return `${m.from}\u0000${m.to}\u0000${m.name}`;
}

function assertSafeIdentifier(name: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${JSON.stringify(name)}`);
  }
}
