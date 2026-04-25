import { describe, it, expect } from 'vitest';
import {
  handleResolveAbbreviation,
  handleSearchLaw,
  handleGetLaw,
  handleGetToc,
  handleSearchFulltext,
  handleExplainLawType,
  toolHandlers,
} from './handlers.js';

describe('handleResolveAbbreviation', () => {
  it('returns resolved entry for known abbreviation', async () => {
    const r = (await handleResolveAbbreviation({ abbr: '消法' })) as {
      abbr: string;
      resolved: { formal: string; domain: string } | null;
    };
    expect(r.resolved).not.toBeNull();
    expect(r.resolved?.formal).toBe('消費税法');
    expect(r.resolved?.domain).toBe('tax');
  });

  it('returns null with note for unknown input', async () => {
    const r = (await handleResolveAbbreviation({ abbr: '存在しない法律' })) as {
      resolved: unknown;
      note?: string;
    };
    expect(r.resolved).toBeNull();
    expect(r.note).toContain('辞書に該当なし');
  });
});

describe('stub handlers (Phase 0)', () => {
  it('search_law returns not_implemented marker', async () => {
    const r = (await handleSearchLaw({ keyword: 'test' })) as { status: string };
    expect(r.status).toBe('not_implemented');
  });

  it('get_law performs abbr resolution even while stubbed', async () => {
    const r = (await handleGetLaw({ law_name: '消法' })) as {
      status: string;
      resolved_abbreviation: { formal: string } | null;
    };
    expect(r.status).toBe('not_implemented');
    expect(r.resolved_abbreviation?.formal).toBe('消費税法');
  });

  it('get_toc performs abbr resolution even while stubbed', async () => {
    const r = (await handleGetToc({ law_name: '労基法' })) as {
      status: string;
      resolved_abbreviation: { formal: string } | null;
    };
    expect(r.status).toBe('not_implemented');
    expect(r.resolved_abbreviation?.formal).toBe('労働基準法');
  });

  it('search_fulltext returns not_implemented marker', async () => {
    const r = (await handleSearchFulltext({ keyword: 'test' })) as { status: string };
    expect(r.status).toBe('not_implemented');
  });
});

describe('handleExplainLawType', () => {
  it('returns explanation for known law type', async () => {
    const r = (await handleExplainLawType({ name: '政令' })) as {
      found: boolean;
      info?: { name: string; enacting_body: string; binds_citizens: boolean };
    };
    expect(r.found).toBe(true);
    expect(r.info?.name).toBe('政令');
    expect(r.info?.enacting_body).toBe('内閣');
    expect(r.info?.binds_citizens).toBe(true);
  });

  it('resolves alias (施行令 → 政令)', async () => {
    const r = (await handleExplainLawType({ name: '施行令' })) as {
      found: boolean;
      info?: { name: string };
    };
    expect(r.found).toBe(true);
    expect(r.info?.name).toBe('政令');
  });

  it('explains 通達 as non-binding on citizens', async () => {
    const r = (await handleExplainLawType({ name: '通達' })) as {
      found: boolean;
      info?: { binds_citizens: boolean; can_set_penalties: boolean };
    };
    expect(r.info?.binds_citizens).toBe(false);
    expect(r.info?.can_set_penalties).toBe(false);
  });

  it('returns hint for unknown name', async () => {
    const r = (await handleExplainLawType({ name: '架空法令' })) as {
      found: boolean;
      hint?: string;
    };
    expect(r.found).toBe(false);
    expect(r.hint).toContain('試せる名前');
  });
});

describe('toolHandlers map', () => {
  it('registers all expected tools', () => {
    expect(Object.keys(toolHandlers).sort()).toEqual(
      [
        'explain_law_type',
        'get_law',
        'get_toc',
        'resolve_abbreviation',
        'search_fulltext',
        'search_law',
      ].sort()
    );
  });
});
