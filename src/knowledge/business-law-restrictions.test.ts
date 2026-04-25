import { describe, it, expect } from 'vitest';
import {
  BUSINESS_LAW_RESTRICTIONS,
  findBusinessLawRestriction,
  listBusinessLawProfessions,
} from './business-law-restrictions.js';

describe('BUSINESS_LAW_RESTRICTIONS data integrity', () => {
  it('contains 7 major professions', () => {
    expect(Object.keys(BUSINESS_LAW_RESTRICTIONS)).toEqual(
      expect.arrayContaining([
        '弁護士',
        '税理士',
        '社会保険労務士',
        '公認会計士',
        '司法書士',
        '行政書士',
        '弁理士',
      ])
    );
  });

  it('every entry has required fields', () => {
    for (const [name, entry] of Object.entries(BUSINESS_LAW_RESTRICTIONS)) {
      expect(entry.profession, name).toBeTruthy();
      expect(entry.law_name, name).toBeTruthy();
      expect(entry.clause, name).toBeTruthy();
      expect(entry.monopoly_act_summary, name).toBeTruthy();
      expect(Array.isArray(entry.triggers), name).toBe(true);
      expect(entry.triggers.length, name).toBeGreaterThan(0);
      expect(entry.penalty, name).toBeTruthy();
      expect(Array.isArray(entry.safe_examples), name).toBe(true);
      expect(entry.safe_examples.length, name).toBeGreaterThan(0);
      expect(Array.isArray(entry.unsafe_examples), name).toBe(true);
      expect(entry.unsafe_examples.length, name).toBeGreaterThan(0);
      expect(entry.law_url, name).toMatch(/^https:\/\/laws\.e-gov\.go\.jp\/law\//);
    }
  });

  it('税理士 entry notes that 無償でも独占 (unique to 税理士法)', () => {
    const r = BUSINESS_LAW_RESTRICTIONS['税理士'];
    expect(r.triggers).not.toContain('報酬目的');
    expect(JSON.stringify(r.notes)).toContain('無償でも');
  });
});

describe('findBusinessLawRestriction()', () => {
  it('resolves by profession name', () => {
    expect(findBusinessLawRestriction('弁護士')?.law_name).toBe('弁護士法');
  });

  it('resolves by law name', () => {
    expect(findBusinessLawRestriction('税理士法')?.profession).toBe('税理士');
    expect(findBusinessLawRestriction('社会保険労務士法')?.profession).toContain('社会保険労務士');
  });

  it('resolves by short alias', () => {
    expect(findBusinessLawRestriction('社労士')?.profession).toContain('社会保険労務士');
    expect(findBusinessLawRestriction('会計士')?.profession).toBe('公認会計士');
  });

  it('handles whitespace trimming', () => {
    expect(findBusinessLawRestriction('  弁護士  ')?.law_name).toBe('弁護士法');
  });

  it('returns null for unknown name', () => {
    expect(findBusinessLawRestriction('架空士業')).toBeNull();
  });
});

describe('listBusinessLawProfessions()', () => {
  it('returns at least 7 professions', () => {
    expect(listBusinessLawProfessions().length).toBeGreaterThanOrEqual(7);
  });
});
