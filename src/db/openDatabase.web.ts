import type { ScheduleDatabase } from './database';

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

const STORAGE_KEY = 'ofs.webdb.v1';

function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revive);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.__u8)) return Uint8Array.from(record.__u8 as number[]);
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) next[key] = revive(item);
  return next;
}

function loadTables(): Tables {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return revive(JSON.parse(raw)) as Tables;
  } catch {
    return {};
  }
}

function saveTables(tables: Tables) {
  if (typeof localStorage === 'undefined') return;
  const json = JSON.stringify(tables, (_key, value) => {
    if (value instanceof Uint8Array) return { __u8: Array.from(value) };
    return value;
  });
  localStorage.setItem(STORAGE_KEY, json);
}

function table(tables: Tables, name: string): Row[] {
  if (!tables[name]) tables[name] = [];
  return tables[name];
}

function statements(source: string): string[] {
  return source.split(';').map((item) => item.trim()).filter(Boolean);
}

function valuesOf(source: string, params: unknown[]): unknown[] {
  const match = source.match(/VALUES\s*\((.*)\)\s*$/i);
  if (!match) return [];
  const parts = match[1].split(',').map((item) => item.trim());
  let index = 0;
  return parts.map((part) => {
    if (part === '?') return params[index++];
    if (part === 'NULL') return null;
    if ((part.startsWith("'") && part.endsWith("'")) || (part.startsWith('"') && part.endsWith('"'))) {
      return part.slice(1, -1);
    }
    if (/^-?\d+$/.test(part)) return Number(part);
    return part;
  });
}

function columnsOf(source: string): string[] {
  const match = source.match(/\(([^)]*)\)\s*VALUES/i);
  if (!match) return [];
  return match[1].split(',').map((item) => item.trim()).filter(Boolean);
}

function whereMatch(source: string, row: Row, params: unknown[]): boolean {
  const match = source.match(/WHERE\s+(.+)$/i);
  if (!match) return true;
  const clause = match[1].replace(/\s+ORDER\s+BY[\s\S]*$/i, '').trim();
  let index = (source.match(/\?/g) || []).length;
  // Parameters in WHERE are the ones not consumed by earlier placeholders.
  const before = source.slice(0, source.toUpperCase().indexOf('WHERE'));
  const used = (before.match(/\?/g) || []).length;
  index = used;
  const checks = clause.split(/\s+AND\s+/i);
  return checks.every((check) => {
    const less = check.match(/^(\w+)\s*<=\s*(\?|\d+)$/);
    if (less) {
      const value = less[2] === '?' ? params[index++] : Number(less[2]);
      return Number(row[less[1]]) <= Number(value);
    }
    const equal = check.match(/^(\w+)\s*=\s*(\?|\d+|'[^']*')$/) || check.match(/^(\w+)\s*=\s*("[^"]*")$/);
    if (!equal) return true;
    const raw = equal[2];
    const value = raw === '?' ? params[index++] : raw.startsWith("'") || raw.startsWith('"') ? raw.slice(1, -1) : Number(raw);
    return row[equal[1]] === value;
  });
}

function apply(tables: Tables, source: string, params: unknown[]) {
  const sql = source.replace(/\s+/g, ' ').trim();
  const create = sql.match(/^CREATE TABLE IF NOT EXISTS (\w+)/i);
  if (create) {
    table(tables, create[1]);
    return;
  }
  const alter = sql.match(/^ALTER TABLE (\w+)/i);
  if (alter) {
    table(tables, alter[1]);
    throw new Error('column exists');
  }
  const del = sql.match(/^DELETE FROM (\w+)/i);
  if (del) {
    const rows = table(tables, del[1]);
    tables[del[1]] = /WHERE/i.test(sql) ? rows.filter((row) => !whereMatch(sql, row, params)) : [];
    return;
  }
  const update = sql.match(/^UPDATE (\w+)\s+SET\s+(.+?)\s+WHERE\s+/i);
  if (update) {
    const names = [...update[2].matchAll(/(\w+)\s*=\s*\?/g)].map((item) => item[1]);
    for (const row of table(tables, update[1])) {
      if (!whereMatch(sql, row, params)) continue;
      names.forEach((name, index) => {
        row[name] = params[index];
      });
    }
    return;
  }
  const insert = sql.match(/^INSERT(?: OR (REPLACE|IGNORE))? INTO (\w+)/i);
  if (insert) {
    const mode = (insert[1] || '').toUpperCase();
    const name = insert[2];
    const columns = columnsOf(sql);
    const values = valuesOf(sql, params);
    const row: Row = {};
    columns.forEach((column, index) => {
      row[column] = values[index];
    });
    const rows = table(tables, name);
    if (name === 'outbox' && row.id == null) {
      row.id = rows.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    }
    const same = rows.findIndex((existing) => {
      if (name === 'inbound_parts') return existing.group_id === row.group_id && existing.part_index === row.part_index;
      return existing.id === row.id;
    });
    if (same >= 0 && mode === 'IGNORE') return;
    if (same >= 0) rows[same] = { ...rows[same], ...row };
    else rows.push(row);
    return;
  }
  throw new Error(`Unsupported statement: ${sql.slice(0, 80)}`);
}

function select(tables: Tables, source: string, params: unknown[]): Row[] {
  const sql = source.replace(/\s+/g, ' ').trim();
  const match = sql.match(/^SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
  if (!match) throw new Error(`Unsupported query: ${sql.slice(0, 80)}`);
  const columns = match[1].split(',').map((item) => item.trim());
  let rows = table(tables, match[2]).filter((row) => whereMatch(sql, row, params));
  if (/ORDER BY part_index ASC/i.test(sql)) {
    rows = [...rows].sort((a, b) => Number(a.part_index) - Number(b.part_index));
  }
  return rows.map((row) => {
    if (columns.length === 1 && columns[0] === '*') return { ...row };
    const picked: Row = {};
    for (const column of columns) picked[column] = row[column];
    return picked;
  });
}

export function openDatabaseAsync(_name: string): Promise<ScheduleDatabase> {
  const tables = loadTables();
  const write = (source: string, params: unknown[]) => {
    for (const statement of statements(source)) apply(tables, statement, params);
    saveTables(tables);
  };
  const database: ScheduleDatabase = {
    async execAsync(source) {
      for (const statement of statements(source)) {
        try {
          apply(tables, statement, []);
        } catch (error) {
          if (!/^ALTER TABLE/i.test(statement)) throw error;
        }
      }
      saveTables(tables);
    },
    runSync(source, ...params) {
      write(source, params);
      return { changes: 1 };
    },
    async runAsync(source, ...params) {
      return this.runSync(source, ...params);
    },
    async getFirstAsync<T>(source: string, ...params: unknown[]) {
      return (select(tables, source, params)[0] as T | undefined) ?? null;
    },
    getFirstSync<T>(source: string, ...params: unknown[]) {
      return (select(tables, source, params)[0] as T | undefined) ?? null;
    },
    getAllSync<T>(source: string, ...params: unknown[]) {
      return select(tables, source, params) as T[];
    },
  };
  return Promise.resolve(database);
}
