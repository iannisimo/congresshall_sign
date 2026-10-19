import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrations } from './migrations.ts';

describe('media presets migration', () => {
  it('moves order, enabled and fit of the media into the default preset', () => {
    const at = migrations.findIndex((sql) => sql.includes('CREATE TABLE media_presets'));
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    for (const sql of migrations.slice(0, at)) db.exec(sql);
    const insert = db.prepare(
      "INSERT INTO media (id, kind, name, mime, file, size, sort_order, created_at, enabled, fit) VALUES (?, 'image', ?, 'image/png', ?, 1, ?, 0, ?, ?)",
    );
    insert.run(1, 'one', 'one.png', 2, 1, null);
    insert.run(2, 'two', 'two.png', 0, 0, 'cover');
    insert.run(3, 'three', 'three.png', 1, 1, 'fill');
    db.exec(migrations[at]!);

    const items = db
      .prepare('SELECT media_id AS mediaId, enabled, fit FROM media_preset_items ORDER BY position')
      .all()
      .map((r) => ({ ...r }));
    expect(items).toEqual([
      { mediaId: 2, enabled: 0, fit: 'cover' },
      { mediaId: 3, enabled: 1, fit: 'fill' },
      { mediaId: 1, enabled: 1, fit: null },
    ]);
    expect({ ...db.prepare('SELECT name, label, is_default AS d, image_seconds AS s, fit FROM media_presets').get() }).toEqual({
      name: 'default',
      label: 'Predefinito',
      d: 1,
      s: null,
      fit: null,
    });
    expect({ ...db.prepare('SELECT count(*) AS n FROM media').get() }).toEqual({ n: 3 });
  });
});
