import { describe, expect, it } from 'vitest';
import {
  type ExtractedReference,
  extractReferences,
  findLawNumMentions,
} from './reference-extractor.js';

// 所得税法 第57条の2 第2項（2026-09-19 に e-Gov から取得した本文の抜粋）
const P2 =
  '前項に規定する特定支出とは、居住者の次に掲げる支出（その支出につきその者に係る第二十八条第一項に規定する給与等の支払をする者（以下この項において「給与等の支払者」という。）により補塡される部分があり、かつ、その補塡される部分につき所得税が課されない場合における当該補塡される部分及びその支出につき雇用保険法（昭和四十九年法律第百十六号）第十条第五項第一号（失業等給付）に規定する教育訓練給付金、母子及び父子並びに寡婦福祉法（昭和三十九年法律第百二十九号）第三十一条第一号（母子家庭自立支援給付金）に規定する母子家庭自立支援教育訓練給付金又は同法第三十一条の十（父子家庭自立支援給付金）において準用する同号に規定する父子家庭自立支援教育訓練給付金が支給される部分がある場合における当該支給される部分を除く。）をいう。';
const ITEM1 =
  'その者の通勤のために必要な交通機関の利用又は交通用具の使用のための支出で、その通勤の経路及び方法がその者の通勤に係る運賃、時間、距離その他の事情に照らして最も経済的かつ合理的であることにつき財務省令で定めるところにより給与等の支払者により証明がされたもののうち、一般の通勤者につき通常必要であると認められる部分として政令で定める支出';
const ITEM4 =
  '職務の遂行に直接必要な技術又は知識を習得することを目的として受講する研修（人の資格を取得するためのものを除く。）であることにつき、財務省令で定めるところにより、給与等の支払者により証明がされたもののための支出又はキャリアコンサルタント（職業能力開発促進法第三十条の三（業務）に規定するキャリアコンサルタントをいう。次号において同じ。）により証明がされたもののための支出（教育訓練（雇用保険法第六十条の二第一項（教育訓練給付金）に規定する教育訓練をいう。同号において同じ。）に係る部分に限る。）';
const P1 =
  '居住者が、各年において特定支出をした場合において、その年中の特定支出の額の合計額が第二十八条第二項（給与所得）に規定する給与所得控除額の二分の一に相当する金額を超えるときは、その年分の同項に規定する給与所得の金額は、同項及び同条第四項の規定にかかわらず、同条第二項の残額からその超える部分の金額を控除した金額とする。';

const KOYO = {
  title: '雇用保険法',
  law_id: '349AC0000000116',
  law_num: '昭和四十九年法律第百十六号',
};
const BOSHI = {
  title: '母子及び父子並びに寡婦福祉法',
  law_id: '339AC0000000129',
  law_num: '昭和三十九年法律第百二十九号',
};

describe('findLawNumMentions', () => {
  it('「（法令番号）」を法令番号ごとに 1 回ずつ列挙する', () => {
    const m = findLawNumMentions(P2);
    expect(m.map((x) => x.law_num)).toEqual([
      '昭和四十九年法律第百十六号',
      '昭和三十九年法律第百二十九号',
    ]);
    // 候補名は前に「つき」などが付く。末尾だけが法令名なので、呼び出し側は法令番号で解決する
    expect(m[0].name_candidate.endsWith('雇用保険法')).toBe(true);
  });

  it('法令番号が無ければ空', () => {
    expect(findLawNumMentions(ITEM1)).toEqual([]);
  });
});

describe('extractReferences', () => {
  it('① 法令名（法令番号）+ 条項号 を external で返し、条・項・号を get_law に渡せる形にする', () => {
    const r = extractReferences(P2, { resolvedByNum: [KOYO, BOSHI], knownLaws: [] });
    const ext = r.references.filter((x) => x.kind === 'external');
    expect(ext).toEqual([
      expect.objectContaining({
        raw: '雇用保険法（昭和四十九年法律第百十六号）第十条第五項第一号',
        law_name: '雇用保険法',
        law_id: '349AC0000000116',
        article: '10',
        paragraph: 5,
        item: '1',
        resolved: true,
      }),
      expect.objectContaining({
        law_name: '母子及び父子並びに寡婦福祉法',
        article: '31',
        item: '1',
        resolved: true,
      }),
    ]);
  });

  it('② 「同法第三十一条の十」「同号」「前項」は relative で、解決しない', () => {
    const r = extractReferences(P2, { resolvedByNum: [KOYO, BOSHI], knownLaws: [] });
    const rel = r.references.filter((x) => x.kind === 'relative').map((x) => x.raw);
    expect(rel).toEqual(['前項', '同法第三十一条の十', '同号']);
    for (const x of r.references) {
      if (x.kind === 'relative') expect(x.resolved).toBe(false);
    }
  });

  it('④ 法令名の無い「第二十八条第一項」は internal', () => {
    const r = extractReferences(P2, { resolvedByNum: [KOYO, BOSHI], knownLaws: [] });
    const internal = r.references.filter((x) => x.kind === 'internal');
    expect(internal).toEqual([
      { kind: 'internal', raw: '第二十八条第一項', article: '28', paragraph: 1 },
    ]);
  });

  it('参照は本文の出現順に並ぶ', () => {
    const r = extractReferences(P2, { resolvedByNum: [KOYO, BOSHI], knownLaws: [] });
    expect(r.references.map((x) => x.raw)).toEqual([
      '前項',
      '第二十八条第一項',
      '雇用保険法（昭和四十九年法律第百十六号）第十条第五項第一号',
      '母子及び父子並びに寡婦福祉法（昭和三十九年法律第百二十九号）第三十一条第一号',
      '同法第三十一条の十',
      '同号',
    ]);
  });

  it('③ 既知の法令名 + 条項号（法令番号なし）を external にする。知らない名前は候補付きの未解決', () => {
    const r = extractReferences(ITEM4, { resolvedByNum: [KOYO], knownLaws: [] });
    const ext = r.references.filter(
      (x): x is Extract<ExtractedReference, { kind: 'external' }> => x.kind === 'external'
    );
    expect(ext).toEqual([
      expect.objectContaining({
        raw: '職業能力開発促進法第三十条の三',
        law_name: '職業能力開発促進法',
        article: '30の3',
        resolved: false,
      }),
      expect.objectContaining({
        raw: '雇用保険法第六十条の二第一項',
        law_name: '雇用保険法',
        law_id: '349AC0000000116',
        article: '60の2',
        paragraph: 1,
        resolved: true,
      }),
    ]);
    expect(ext[0].law_id).toBeUndefined();
  });

  it('⑤ 「政令で定める」「財務省令で定める」を出現回数つきでまとめ、政令と省令で委任先を分ける', () => {
    const r = extractReferences(`${ITEM1}\n${ITEM4}`, { resolvedByNum: [], knownLaws: [] });
    expect(r.delegations).toEqual([
      { kind: 'delegation', raw: '財務省令で定める', count: 2, target: 'enforcement_rule' },
      { kind: 'delegation', raw: '政令で定める', count: 1, target: 'enforcement_order' },
    ]);
  });

  it('「同項」「同条第四項」「同条第二項」は relative、「第二十八条第二項」は internal', () => {
    const r = extractReferences(P1, { resolvedByNum: [], knownLaws: [] });
    expect(r.references).toEqual([
      { kind: 'internal', raw: '第二十八条第二項', article: '28', paragraph: 2 },
      { kind: 'relative', raw: '同項', resolved: false },
      { kind: 'relative', raw: '同項', resolved: false },
      { kind: 'relative', raw: '同条第四項', resolved: false },
      { kind: 'relative', raw: '同条第二項', resolved: false },
    ]);
  });

  it('施行令の本文の「法第五十七条の二第二項第一号」は、parentAct があれば親の法律への external', () => {
    const text = '法第五十七条の二第二項第一号に規定する政令で定める支出は、次に掲げる支出とする。';
    const parent = {
      title: '所得税法',
      law_id: '340AC0000000033',
      law_num: '昭和四十年法律第三十三号',
    };
    const r = extractReferences(text, { resolvedByNum: [], knownLaws: [], parentAct: parent });
    expect(r.references).toEqual([
      expect.objectContaining({
        kind: 'external',
        raw: '法第五十七条の二第二項第一号',
        law_name: '所得税法',
        law_id: '340AC0000000033',
        article: '57の2',
        paragraph: 2,
        item: '1',
        resolved: true,
      }),
    ]);
  });

  it('parentAct が無ければ「法第N条」は候補名「法」の未解決 external', () => {
    const text = '法第五十七条の二の規定により';
    const r = extractReferences(text, { resolvedByNum: [], knownLaws: [] });
    expect(r.references).toEqual([
      expect.objectContaining({
        kind: 'external',
        law_name: '法',
        article: '57の2',
        resolved: false,
      }),
    ]);
  });

  it('既知の名前の直前が漢字なら（「旧所得税法」）その名前では取らず、長い候補名の未解決にする', () => {
    const text = '旧所得税法第九条の規定は、なお効力を有する。';
    const r = extractReferences(text, {
      resolvedByNum: [],
      knownLaws: [{ title: '所得税法', law_id: '340AC0000000033' }],
    });
    expect(r.references).toEqual([
      expect.objectContaining({
        kind: 'external',
        law_name: '旧所得税法',
        article: '9',
        resolved: false,
      }),
    ]);
  });

  it('号だけの参照「第一号」は internal（article なし）', () => {
    const r = extractReferences('第一号に掲げる場合を除く。', { resolvedByNum: [], knownLaws: [] });
    expect(r.references).toEqual([{ kind: 'internal', raw: '第一号', item: '1' }]);
  });

  it('参照の無い本文は空配列', () => {
    const r = extractReferences('この法律は、公布の日から施行する。', {
      resolvedByNum: [],
      knownLaws: [],
    });
    expect(r).toEqual({ references: [], delegations: [] });
  });
});
