import { describe, expect, it } from 'vitest';
import { parentActTitle, relationCandidates } from './law-relations.js';

describe('parentActTitle', () => {
  it('施行令・施行規則の末尾を落として親の法律名にする', () => {
    expect(parentActTitle('所得税法施行令')).toBe('所得税法');
    expect(parentActTitle('所得税法施行規則')).toBe('所得税法');
    expect(
      parentActTitle(
        '租税条約等の実施に伴う所得税法、法人税法及び地方税法の特例等に関する法律施行令'
      )
    ).toBe('租税条約等の実施に伴う所得税法、法人税法及び地方税法の特例等に関する法律');
  });

  it('法律や、名前が接尾辞だけのものは null', () => {
    expect(parentActTitle('所得税法')).toBeNull();
    expect(parentActTitle('施行令')).toBeNull();
    expect(parentActTitle('国税通則法施行令の一部を改正する政令')).toBeNull();
  });
});

describe('relationCandidates', () => {
  it('法律からは施行令と施行規則の 2 候補', () => {
    expect(relationCandidates('所得税法')).toEqual([
      { relation: 'enforcement_order', title: '所得税法施行令' },
      { relation: 'enforcement_rule', title: '所得税法施行規則' },
    ]);
  });

  it('施行令からは親の法律と兄弟の施行規則', () => {
    expect(relationCandidates('所得税法施行令')).toEqual([
      { relation: 'parent_act', title: '所得税法' },
      { relation: 'enforcement_rule', title: '所得税法施行規則' },
    ]);
  });

  it('施行規則からは親の法律と兄弟の施行令', () => {
    expect(relationCandidates('所得税法施行規則')).toEqual([
      { relation: 'parent_act', title: '所得税法' },
      { relation: 'enforcement_order', title: '所得税法施行令' },
    ]);
  });
});
