import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import type { Migration } from "./migration";
import { createMigrationRunner } from "./runner";
import { encodeSemverForUserVersion } from "./semver";

function makeDb(): Database {
  return new Database(":memory:");
}

function getUserVersion(db: Database): number {
  return (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
}

function getTrackingRows(
  db: Database,
  tableName = "_schema_migrations",
): Array<{ from_version: string; to_version: string; name: string }> {
  return db
    .query<{ from_version: string; to_version: string; name: string }, []>(
      `SELECT from_version, to_version, name FROM "${tableName}" ORDER BY from_version, to_version, name`,
    )
    .all();
}

const migrations: Migration[] = [
  {
    from: "0.1.0",
    to: "0.2.0",
    name: "001-add-users",
    up(db) {
      db.run("CREATE TABLE users (id TEXT PRIMARY KEY)");
    },
  },
  {
    from: "0.1.0",
    to: "0.2.0",
    name: "002-add-sessions",
    up(db) {
      db.run("CREATE TABLE sessions (id TEXT PRIMARY KEY)");
    },
  },
  {
    from: "0.2.0",
    to: "0.3.0",
    name: "001-add-email",
    up(db) {
      db.run("ALTER TABLE users ADD COLUMN email TEXT");
    },
  },
];

describe("createMigrationRunner", () => {
  test("applies all migrations on a fresh DB and updates user_version", async () => {
    const db = makeDb();
    const runner = createMigrationRunner();
    const result = await runner.run(db, migrations);

    expect(result.applied).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
    expect(result.finalVersion).toBe("0.3.0");

    expect(getUserVersion(db)).toBe(encodeSemverForUserVersion("0.3.0"));
    expect(getTrackingRows(db)).toEqual([
      { from_version: "0.1.0", to_version: "0.2.0", name: "001-add-users" },
      { from_version: "0.1.0", to_version: "0.2.0", name: "002-add-sessions" },
      { from_version: "0.2.0", to_version: "0.3.0", name: "001-add-email" },
    ]);

    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(users)")
      .all()
      .map((r) => r.name);
    expect(cols).toContain("email");
  });

  test("re-running on the same DB skips all migrations", async () => {
    const db = makeDb();
    const runner = createMigrationRunner();
    await runner.run(db, migrations);
    const second = await runner.run(db, migrations);

    expect(second.applied).toHaveLength(0);
    expect(second.skipped).toHaveLength(3);
    expect(getTrackingRows(db)).toHaveLength(3);
  });

  test("sorts out-of-order input into semver order", async () => {
    const db = makeDb();
    const order: string[] = [];
    const tracked: Migration[] = [
      {
        from: "0.2.0",
        to: "0.3.0",
        name: "001-add-email",
        up(db_) {
          order.push("0.2.0->0.3.0/001");
          db_.run("ALTER TABLE users ADD COLUMN email TEXT");
        },
      },
      {
        from: "0.1.0",
        to: "0.2.0",
        name: "002-add-sessions",
        up(db_) {
          order.push("0.1.0->0.2.0/002");
          db_.run("CREATE TABLE sessions (id TEXT PRIMARY KEY)");
        },
      },
      {
        from: "0.1.0",
        to: "0.2.0",
        name: "001-add-users",
        up(db_) {
          order.push("0.1.0->0.2.0/001");
          db_.run("CREATE TABLE users (id TEXT PRIMARY KEY)");
        },
      },
    ];

    await createMigrationRunner().run(db, tracked);

    expect(order).toEqual(["0.1.0->0.2.0/001", "0.1.0->0.2.0/002", "0.2.0->0.3.0/001"]);
  });

  test("rolls back and rethrows when a migration throws", async () => {
    const db = makeDb();
    const failing: Migration[] = [
      {
        from: "0.1.0",
        to: "0.2.0",
        name: "001-add-users",
        up(db_) {
          db_.run("CREATE TABLE users (id TEXT PRIMARY KEY)");
        },
      },
      {
        from: "0.1.0",
        to: "0.2.0",
        name: "002-boom",
        up(db_) {
          db_.run("CREATE TABLE will_be_rolled_back (id TEXT PRIMARY KEY)");
          throw new Error("boom");
        },
      },
      {
        from: "0.2.0",
        to: "0.3.0",
        name: "001-never-runs",
        up(db_) {
          db_.run("CREATE TABLE never (id TEXT PRIMARY KEY)");
        },
      },
    ];

    await expect(createMigrationRunner().run(db, failing)).rejects.toThrow("boom");

    const tables = new Set(
      db
        .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((r) => r.name),
    );
    expect(tables.has("users")).toBe(true);
    expect(tables.has("will_be_rolled_back")).toBe(false);
    expect(tables.has("never")).toBe(false);

    expect(getTrackingRows(db)).toEqual([
      { from_version: "0.1.0", to_version: "0.2.0", name: "001-add-users" },
    ]);
    expect(getUserVersion(db)).toBe(encodeSemverForUserVersion("0.2.0"));
  });

  test("honors a custom tableName", async () => {
    const db = makeDb();
    const runner = createMigrationRunner({ tableName: "my_migrations" });
    await runner.run(db, [migrations[0] as Migration]);

    const tables = new Set(
      db
        .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((r) => r.name),
    );
    expect(tables.has("my_migrations")).toBe(true);
    expect(tables.has("_schema_migrations")).toBe(false);
    expect(getTrackingRows(db, "my_migrations")).toHaveLength(1);
  });

  test("empty input is a no-op and leaves user_version untouched", async () => {
    const db = makeDb();
    const result = await createMigrationRunner().run(db, []);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.finalVersion).toBe(null);
    expect(getUserVersion(db)).toBe(0);
  });

  test("rejects an unsafe table name", () => {
    expect(() => createMigrationRunner({ tableName: "bad; DROP TABLE x" })).toThrow();
  });

  test("deduplicates identical migrations in one run", async () => {
    const db = makeDb();
    const dup: Migration = {
      from: "0.1.0",
      to: "0.2.0",
      name: "001-add-users",
      up(db_) {
        db_.run("CREATE TABLE users (id TEXT PRIMARY KEY)");
      },
    };
    const result = await createMigrationRunner().run(db, [dup, dup]);
    expect(result.applied).toHaveLength(1);
    expect(getTrackingRows(db)).toHaveLength(1);
  });

  test("re-run with all skipped preserves user_version", async () => {
    const db = makeDb();
    const runner = createMigrationRunner();
    await runner.run(db, migrations);
    const before = getUserVersion(db);
    const second = await runner.run(db, migrations);
    expect(second.applied).toHaveLength(0);
    expect(second.finalVersion).toBe("0.3.0");
    expect(getUserVersion(db)).toBe(before);
  });

  test("subset input does not downgrade user_version", async () => {
    const db = makeDb();
    await createMigrationRunner().run(db, migrations);
    const before = getUserVersion(db);
    const subset = await createMigrationRunner().run(db, [migrations[0] as Migration]);
    expect(subset.applied).toHaveLength(0);
    expect(subset.skipped).toHaveLength(1);
    expect(getUserVersion(db)).toBe(before);
  });

  test("async up() is supported by run()", async () => {
    const db = makeDb();
    const asyncMigration: Migration = {
      from: "0.1.0",
      to: "0.2.0",
      name: "001-async",
      async up(db_) {
        await Promise.resolve();
        db_.run("CREATE TABLE users (id TEXT PRIMARY KEY)");
      },
    };
    const result = await createMigrationRunner().run(db, [asyncMigration]);
    expect(result.applied).toHaveLength(1);
    expect(
      db
        .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((r) => r.name),
    ).toContain("users");
  });
});

describe("createMigrationRunner.runSync", () => {
  test("applies all migrations synchronously and updates user_version", () => {
    const db = makeDb();
    const result = createMigrationRunner().runSync(db, migrations);

    expect(result.applied).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
    expect(result.finalVersion).toBe("0.3.0");
    expect(getUserVersion(db)).toBe(encodeSemverForUserVersion("0.3.0"));
    expect(getTrackingRows(db)).toEqual([
      { from_version: "0.1.0", to_version: "0.2.0", name: "001-add-users" },
      { from_version: "0.1.0", to_version: "0.2.0", name: "002-add-sessions" },
      { from_version: "0.2.0", to_version: "0.3.0", name: "001-add-email" },
    ]);
  });

  test("re-running synchronously skips already-applied migrations", () => {
    const db = makeDb();
    const runner = createMigrationRunner();
    runner.runSync(db, migrations);
    const second = runner.runSync(db, migrations);
    expect(second.applied).toHaveLength(0);
    expect(second.skipped).toHaveLength(3);
  });

  test("rolls back and rethrows when a sync up() throws", () => {
    const db = makeDb();
    const failing: Migration[] = [
      {
        from: "0.1.0",
        to: "0.2.0",
        name: "001-add-users",
        up(db_) {
          db_.run("CREATE TABLE users (id TEXT PRIMARY KEY)");
        },
      },
      {
        from: "0.1.0",
        to: "0.2.0",
        name: "002-boom",
        up(db_) {
          db_.run("CREATE TABLE will_be_rolled_back (id TEXT PRIMARY KEY)");
          throw new Error("boom");
        },
      },
    ];

    expect(() => createMigrationRunner().runSync(db, failing)).toThrow("boom");

    const tables = new Set(
      db
        .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((r) => r.name),
    );
    expect(tables.has("users")).toBe(true);
    expect(tables.has("will_be_rolled_back")).toBe(false);
  });

  test("rejects a Promise-returning up()", () => {
    const db = makeDb();
    const asyncMigration: Migration = {
      from: "0.1.0",
      to: "0.2.0",
      name: "001-async",
      async up(db_) {
        db_.run("CREATE TABLE users (id TEXT PRIMARY KEY)");
      },
    };
    expect(() => createMigrationRunner().runSync(db, [asyncMigration])).toThrow(/runSync/);
    const tables = new Set(
      db
        .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((r) => r.name),
    );
    expect(tables.has("users")).toBe(false);
  });
});
