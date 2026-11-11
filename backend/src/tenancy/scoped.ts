/**
 * In-process state that belongs to one school (MULTI_TENANCY_GAP_FIX_PLAN.md Phase 3).
 *
 * Module-level caches, buffers and SSE subscriber maps were written for one
 * school: `Map<courseId, …>` collides as soon as two tenant databases hand out
 * the same ids. These helpers keep one copy per tenant and pick the current
 * tenant's copy from the context, so the calling code stays the same:
 *
 *   const watchers = new TenantScopedMap<number, Watcher>(); // was new Map()
 *   const st = tenantLocal(() => ({ cache: null as Cache | null })); // was `let cache`
 *   st().cache = …
 *
 * Outside a tenant context the primary tenant is used (shadow mode); enforce
 * mode and runAsPlatform() throw, exactly like the tenant-routed `db`.
 */
import { PRIMARY_TENANT_ID, TenantCtx, currentTenantOrNull, primaryTenantCtx } from "../vendor/nga-tenancy";
import { PLATFORM_CTX, resolveDataTid } from "./context";

/** The tenant id in-process state should use right now (see resolveDataTid). */
export function scopeTid(what = "tenant-scoped state"): number {
  return resolveDataTid(what);
}

/** The context matching scopeTid() (so a flush can re-enter it later). */
export function scopeCtx(what?: string): TenantCtx {
  const t = currentTenantOrNull();
  const tid = scopeTid(what);
  if (t && t !== PLATFORM_CTX && t.tid === tid) return t;
  return tid === PRIMARY_TENANT_ID ? primaryTenantCtx() : primaryTenantCtx({ tid, slug: `t${tid}`, name: `Tenant ${tid}`, isPrimary: false });
}

/** `t<tid>:a:b` for the current scope (never throws for "no context" in shadow mode). */
export function scopedKey(...parts: Array<string | number>): string {
  return [`t${scopeTid()}`, ...parts].join(":");
}

export interface TenantLocal<T> {
  (): T;
  /** Every tenant's value with the context it was created in. */
  all(): Array<{ tid: number; ctx: TenantCtx; value: T }>;
  /** Drop the current tenant's value (the next call re-initialises it). */
  reset(): void;
  /** Drop every tenant's value. */
  resetAll(): void;
}

/** A value per tenant, created lazily by `init` on first use in that tenant. */
export function tenantLocal<T>(init: () => T): TenantLocal<T> {
  const byTid = new Map<number, { ctx: TenantCtx; value: T }>();
  const get = (() => {
    const tid = scopeTid();
    let hit = byTid.get(tid);
    if (!hit) {
      hit = { ctx: scopeCtx(), value: init() };
      byTid.set(tid, hit);
    }
    return hit.value;
  }) as TenantLocal<T>;
  get.all = () => [...byTid.entries()].map(([tid, v]) => ({ tid, ctx: v.ctx, value: v.value }));
  get.reset = () => {
    byTid.delete(scopeTid());
  };
  get.resetAll = () => byTid.clear();
  return get;
}

/** A Map whose contents are per tenant; the API is Map's, for the current tenant. */
export class TenantScopedMap<K, V> {
  private readonly local = tenantLocal(() => new Map<K, V>());
  get [Symbol.toStringTag]() {
    return "TenantScopedMap";
  }
  private m(): Map<K, V> {
    return this.local();
  }
  /** The current tenant's underlying Map (capture it for callbacks that may run outside the context). */
  current(): Map<K, V> {
    return this.local();
  }
  get size() {
    return this.m().size;
  }
  get(k: K) {
    return this.m().get(k);
  }
  set(k: K, v: V) {
    this.m().set(k, v);
    return this;
  }
  has(k: K) {
    return this.m().has(k);
  }
  delete(k: K) {
    return this.m().delete(k);
  }
  /** Clears the current tenant only; clearAll() empties every tenant. */
  clear() {
    this.m().clear();
  }
  clearAll() {
    this.local.resetAll();
  }
  keys() {
    return this.m().keys();
  }
  values() {
    return this.m().values();
  }
  entries() {
    return this.m().entries();
  }
  forEach(cb: (v: V, k: K, map: Map<K, V>) => void, thisArg?: unknown) {
    this.m().forEach(cb, thisArg);
  }
  [Symbol.iterator]() {
    return this.m()[Symbol.iterator]();
  }
  /** Tenants holding at least one entry (for sweeps that visit them). */
  tenants(): Array<{ tid: number; ctx: TenantCtx; size: number }> {
    return this.local.all().filter((e) => e.value.size > 0).map((e) => ({ tid: e.tid, ctx: e.ctx, size: e.value.size }));
  }
}

/** A Set whose contents are per tenant. */
export class TenantScopedSet<T> {
  private readonly local = tenantLocal(() => new Set<T>());
  get [Symbol.toStringTag]() {
    return "TenantScopedSet";
  }
  private s(): Set<T> {
    return this.local();
  }
  /** The current tenant's underlying Set (capture it for callbacks outside the context). */
  current(): Set<T> {
    return this.local();
  }
  get size() {
    return this.s().size;
  }
  add(v: T) {
    this.s().add(v);
    return this;
  }
  has(v: T) {
    return this.s().has(v);
  }
  delete(v: T) {
    return this.s().delete(v);
  }
  clear() {
    this.s().clear();
  }
  clearAll() {
    this.local.resetAll();
  }
  keys() {
    return this.s().keys();
  }
  values() {
    return this.s().values();
  }
  entries() {
    return this.s().entries();
  }
  forEach(cb: (v: T, v2: T, set: Set<T>) => void, thisArg?: unknown) {
    this.s().forEach(cb, thisArg);
  }
  [Symbol.iterator]() {
    return this.s()[Symbol.iterator]();
  }
}
