import fs from 'node:fs';
import path from 'node:path';
import type { Db } from 'mongodb';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE_PATH = path.join(DATA_DIR, 'erp-db.json');

type Doc = Record<string, unknown>;
type StoreData = Record<string, Doc[]>;

declare global {
  var __localErpDbCache: StoreData | undefined;
  var __localErpWriteChain: Promise<void> | undefined;
}

function cloneDoc<T>(val: T): T {
  if (val === null || val === undefined) return val;
  return JSON.parse(JSON.stringify(val)) as T;
}

function ensureStoreLoaded(): StoreData {
  if (globalThis.__localErpDbCache) {
    return globalThis.__localErpDbCache;
  }
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf8');
      if (raw.trim()) {
        const parsed = JSON.parse(raw) as StoreData;
        if (parsed && typeof parsed === 'object') {
          globalThis.__localErpDbCache = parsed;
          return globalThis.__localErpDbCache;
        }
      }
    }
  } catch (err) {
    console.error('Failed to load local ERP database file, initializing clean store:', err);
  }
  globalThis.__localErpDbCache = {};
  return globalThis.__localErpDbCache;
}

function persistStoreSync(store: StoreData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${DB_FILE_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_FILE_PATH);
}

async function withWriteLock<T>(fn: (store: StoreData) => T): Promise<T> {
  const prev = globalThis.__localErpWriteChain || Promise.resolve();
  let result!: T;
  const next = prev.then(() => {
    const store = ensureStoreLoaded();
    result = fn(store);
    persistStoreSync(store);
  });
  globalThis.__localErpWriteChain = next.catch(() => undefined);
  await next;
  return result;
}

function getByPath(obj: Doc, dotPath: string): unknown {
  if (dotPath in obj) return obj[dotPath];
  const parts = dotPath.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Doc)[part];
  }
  return cur;
}

function setByPath(obj: Doc, dotPath: string, value: unknown): void {
  const parts = dotPath.split('.');
  let cur: Doc = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cur[key];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      cur[key] = {};
    }
    cur = cur[key] as Doc;
  }
  const last = parts[parts.length - 1];
  if (value === undefined) {
    delete cur[last];
  } else {
    cur[last] = cloneDoc(value);
  }
}

function unsetByPath(obj: Doc, dotPath: string): void {
  const parts = dotPath.split('.');
  let cur: Doc = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
    if (next === null || typeof next !== 'object') return;
    cur = next as Doc;
  }
  delete cur[parts[parts.length - 1]];
}

function matchesFilter(doc: Doc, filter: Doc = {}): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    const docVal = getByPath(doc, key);
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      const condObj = cond as Doc;
      if ('$in' in condObj && Array.isArray(condObj.$in)) {
        if (!condObj.$in.includes(docVal)) return false;
        continue;
      }
      if ('$regex' in condObj) {
        const pattern = String(condObj.$regex || '');
        const flags = typeof condObj.$options === 'string' ? condObj.$options : '';
        const regex = new RegExp(pattern, flags);
        if (!regex.test(String(docVal ?? ''))) return false;
        continue;
      }
    }
    if (docVal !== cond) return false;
  }
  return true;
}

function applyProjection(doc: Doc, projection?: Doc): Doc {
  if (!projection || Object.keys(projection).length === 0) {
    return cloneDoc(doc);
  }
  const out: Doc = {};
  for (const [k, v] of Object.entries(projection)) {
    if (v) {
      if (k in doc) out[k] = cloneDoc(doc[k]);
    }
  }
  if ('_id' in doc && projection._id !== 0) {
    out._id = doc._id;
  }
  return out;
}

function applyUpdateOps(target: Doc, update: Doc, isInsert: boolean): Doc {
  const doc = cloneDoc(target);

  if (isInsert && update.$setOnInsert && typeof update.$setOnInsert === 'object') {
    for (const [k, v] of Object.entries(update.$setOnInsert as Doc)) {
      setByPath(doc, k, v);
    }
  }
  if (update.$set && typeof update.$set === 'object') {
    for (const [k, v] of Object.entries(update.$set as Doc)) {
      setByPath(doc, k, v);
    }
  }
  if (update.$unset && typeof update.$unset === 'object') {
    for (const k of Object.keys(update.$unset as Doc)) {
      unsetByPath(doc, k);
    }
  }
  if (update.$inc && typeof update.$inc === 'object') {
    for (const [k, delta] of Object.entries(update.$inc as Record<string, number>)) {
      const existing = Number(getByPath(doc, k) ?? 0);
      setByPath(doc, k, existing + Number(delta || 0));
    }
  }
  return doc;
}

class LocalCursor {
  private docs: Doc[];
  private sortSpec: Record<string, 1 | -1> | null = null;

  constructor(docs: Doc[]) {
    this.docs = docs;
  }

  sort(spec: Record<string, 1 | -1>): this {
    this.sortSpec = spec;
    return this;
  }

  async toArray(): Promise<Doc[]> {
    const copy = this.docs.map((d) => cloneDoc(d));
    if (!this.sortSpec) return copy;
    const entries = Object.entries(this.sortSpec);
    copy.sort((a, b) => {
      for (const [field, dir] of entries) {
        const av = getByPath(a, field);
        const bv = getByPath(b, field);
        if (av === bv) continue;
        if (av === undefined || av === null) return 1;
        if (bv === undefined || bv === null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') {
          return (av - bv) * dir;
        }
        return String(av).localeCompare(String(bv)) * dir;
      }
      return 0;
    });
    return copy;
  }
}

class LocalCollection {
  constructor(private readonly name: string) {}

  private getList(store: StoreData): Doc[] {
    if (!Array.isArray(store[this.name])) {
      store[this.name] = [];
    }
    return store[this.name];
  }

  find(filter: Doc = {}, options?: { projection?: Doc }): LocalCursor {
    const store = ensureStoreLoaded();
    const list = this.getList(store);
    const matched = list
      .filter((doc) => matchesFilter(doc, filter))
      .map((doc) => applyProjection(doc, options?.projection));
    return new LocalCursor(matched);
  }

  async findOne(filter: Doc = {}, options?: { projection?: Doc }): Promise<Doc | null> {
    const store = ensureStoreLoaded();
    const list = this.getList(store);
    const found = list.find((doc) => matchesFilter(doc, filter));
    return found ? applyProjection(found, options?.projection) : null;
  }

  async countDocuments(filter: Doc = {}): Promise<number> {
    const store = ensureStoreLoaded();
    const list = this.getList(store);
    if (!filter || Object.keys(filter).length === 0) return list.length;
    return list.filter((doc) => matchesFilter(doc, filter)).length;
  }

  async insertOne(doc: Doc): Promise<{ acknowledged: boolean; insertedId: unknown }> {
    return withWriteLock((store) => {
      const list = this.getList(store);
      const copy = cloneDoc(doc);
      if (copy._id === undefined) {
        copy._id = copy.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      }
      list.push(copy);
      return { acknowledged: true, insertedId: copy._id };
    });
  }

  async insertMany(docs: Doc[]): Promise<{ acknowledged: boolean; insertedCount: number }> {
    return withWriteLock((store) => {
      const list = this.getList(store);
      for (const doc of docs) {
        const copy = cloneDoc(doc);
        if (copy._id === undefined) {
          copy._id = copy.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        }
        list.push(copy);
      }
      return { acknowledged: true, insertedCount: docs.length };
    });
  }

  async updateOne(
    filter: Doc,
    update: Doc,
    options?: { upsert?: boolean }
  ): Promise<{ acknowledged: boolean; matchedCount: number; modifiedCount: number; upsertedCount: number }> {
    return withWriteLock((store) => {
      const list = this.getList(store);
      const idx = list.findIndex((doc) => matchesFilter(doc, filter));
      if (idx >= 0) {
        list[idx] = applyUpdateOps(list[idx], update, false);
        return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
      }
      if (options?.upsert) {
        const base: Doc = {};
        for (const [k, v] of Object.entries(filter)) {
          if (typeof v !== 'object' || v === null) {
            setByPath(base, k, v);
          }
        }
        const inserted = applyUpdateOps(base, update, true);
        if (inserted._id === undefined) {
          inserted._id = inserted.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        }
        list.push(inserted);
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    });
  }

  async updateMany(
    filter: Doc,
    update: Doc
  ): Promise<{ acknowledged: boolean; matchedCount: number; modifiedCount: number }> {
    return withWriteLock((store) => {
      const list = this.getList(store);
      let matched = 0;
      for (let i = 0; i < list.length; i++) {
        if (matchesFilter(list[i], filter)) {
          list[i] = applyUpdateOps(list[i], update, false);
          matched++;
        }
      }
      return { acknowledged: true, matchedCount: matched, modifiedCount: matched };
    });
  }

  async deleteOne(filter: Doc): Promise<{ acknowledged: boolean; deletedCount: number }> {
    return withWriteLock((store) => {
      const list = this.getList(store);
      const idx = list.findIndex((doc) => matchesFilter(doc, filter));
      if (idx < 0) return { acknowledged: true, deletedCount: 0 };
      list.splice(idx, 1);
      return { acknowledged: true, deletedCount: 1 };
    });
  }

  async deleteMany(filter: Doc = {}): Promise<{ acknowledged: boolean; deletedCount: number }> {
    return withWriteLock((store) => {
      const list = this.getList(store);
      if (!filter || Object.keys(filter).length === 0) {
        const count = list.length;
        store[this.name] = [];
        return { acknowledged: true, deletedCount: count };
      }
      const before = list.length;
      store[this.name] = list.filter((doc) => !matchesFilter(doc, filter));
      return { acknowledged: true, deletedCount: before - store[this.name].length };
    });
  }

  async findOneAndUpdate(
    filter: Doc,
    update: Doc,
    options?: { upsert?: boolean; returnDocument?: 'before' | 'after' }
  ): Promise<Doc | null> {
    return withWriteLock((store) => {
      const list = this.getList(store);
      const idx = list.findIndex((doc) => matchesFilter(doc, filter));
      if (idx >= 0) {
        const before = cloneDoc(list[idx]);
        const after = applyUpdateOps(list[idx], update, false);
        list[idx] = after;
        return options?.returnDocument === 'before' ? before : cloneDoc(after);
      }
      if (options?.upsert) {
        const base: Doc = {};
        for (const [k, v] of Object.entries(filter)) {
          if (typeof v !== 'object' || v === null) {
            setByPath(base, k, v);
          }
        }
        const inserted = applyUpdateOps(base, update, true);
        if (inserted._id === undefined) {
          inserted._id = inserted.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        }
        list.push(inserted);
        return options?.returnDocument === 'before' ? null : cloneDoc(inserted);
      }
      return null;
    });
  }

  async createIndex(): Promise<string> {
    return 'local_idx';
  }
}

const localDbInstance = {
  collection(name: string) {
    return new LocalCollection(name);
  },
  async command() {
    ensureStoreLoaded();
    return { ok: 1 };
  },
};

export function getLocalDb(): Db {
  return localDbInstance as unknown as Db;
}

export function getLocalDbFilePath(): string {
  return DB_FILE_PATH;
}
