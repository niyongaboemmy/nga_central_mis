import "@testing-library/jest-dom/vitest";

// Node's built-in experimental `localStorage`/`sessionStorage` globals shadow
// jsdom's own (working) implementations in this Node version, leaving
// `window.localStorage.clear` etc. undefined. Replace both with a small
// in-memory polyfill so storage-backed contexts behave the same as a browser.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

Object.defineProperty(window, "localStorage", {
  value: new MemoryStorage(),
  writable: true,
});
Object.defineProperty(window, "sessionStorage", {
  value: new MemoryStorage(),
  writable: true,
});
globalThis.localStorage = window.localStorage;
globalThis.sessionStorage = window.sessionStorage;

// jsdom doesn't implement matchMedia; ThemeContext reads it to detect the
// OS-level color scheme preference.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
