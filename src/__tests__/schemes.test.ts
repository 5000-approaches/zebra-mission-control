import { describe, it, expect } from 'vitest';
import {
  COLOR_SCHEMES,
  DEFAULT_SCHEME,
  DEFAULT_MODE,
  SCHEME_STORAGE_KEY,
  MODE_STORAGE_KEY,
} from '@/lib/schemes';

describe('schemes registry', () => {
  it('exposes the zebra-yellow default', () => {
    expect(DEFAULT_SCHEME).toBe('zebra-yellow');
    expect(COLOR_SCHEMES.find((s) => s.id === DEFAULT_SCHEME)).toBeDefined();
  });

  it('every scheme has id, label, company, and swatch', () => {
    for (const scheme of COLOR_SCHEMES) {
      expect(scheme.id).toMatch(/^[a-z0-9-]+$/);
      expect(scheme.label.length).toBeGreaterThan(0);
      expect(scheme.company.length).toBeGreaterThan(0);
      expect(scheme.swatch).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('scheme ids are unique', () => {
    const ids = COLOR_SCHEMES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('storage keys are namespaced to mission control', () => {
    expect(SCHEME_STORAGE_KEY).toBe('zmc-scheme');
    expect(MODE_STORAGE_KEY).toBe('zmc-mode');
  });

  it('default mode is light', () => {
    expect(DEFAULT_MODE).toBe('light');
  });
});
