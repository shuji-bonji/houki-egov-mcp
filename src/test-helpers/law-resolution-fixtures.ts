/**
 * 差分 20261003-law-resolution の受入テストで使う e-Gov の応答の差し替え。
 *
 * - `/laws` は部分一致で、`limit` と `offset` を守り、`total_count` に全件の数を入れる
 *   （「先頭の数件で打ち切らずに全件から探す」を確かめるため）
 * - `asof` を付けた検索は、その時点の題名で照合する（`asofTitles`）
 * - 消費税法は、本則に第100条が無く、附則(27)・附則(168)に第100条がある（2026-10-03 の e-Gov の形）
 *
 * 値は specs/changes/20261003-law-resolution/ の「確かめた値」と各 spec.md の「例:」から取る。
 * tsconfig の exclude 対象（dist には含めない）。
 */

import { type AnyObj, json, type LawFixture, lawListItem } from './mcp-harness.js';

export const node = (tag: string, attr: Record<string, string>, children: unknown[]): AnyObj => ({
  tag,
  attr,
  children,
});
export const sentence = (text: string): AnyObj => node('Sentence', { Num: '1' }, [text]);
export const paragraph = (num: string, text: string, extra: AnyObj[] = []): AnyObj =>
  node('Paragraph', { Num: num }, [
    node('ParagraphNum', {}, []),
    node('ParagraphSentence', {}, [sentence(text)]),
    ...extra,
  ]);
export const item = (num: string, title: string, text: string): AnyObj =>
  node('Item', { Num: num }, [
    node('ItemTitle', {}, [title]),
    node('ItemSentence', {}, [sentence(text)]),
  ]);
export const article = (
  num: string,
  title: string,
  paragraphs: AnyObj[],
  caption?: string
): AnyObj =>
  node('Article', { Num: num }, [
    ...(caption ? [node('ArticleCaption', {}, [caption])] : []),
    node('ArticleTitle', {}, [title]),
    ...paragraphs,
  ]);

/** 本則の条を並べた法令本文。附則も足せる */
export function lawTree(title: string, mainArticles: AnyObj[], suppl: AnyObj[] = []): AnyObj {
  return node('Law', {}, [
    node('LawBody', {}, [
      node('LawTitle', {}, [title]),
      node('MainProvision', {}, mainArticles),
      ...suppl,
    ]),
  ]);
}

export function supplProvision(
  amendLawNum: string | null,
  children: AnyObj[],
  extract = false
): AnyObj {
  const attr: Record<string, string> = {};
  if (amendLawNum) attr.AmendLawNum = amendLawNum;
  if (extract) attr.Extract = 'true';
  return node('SupplProvision', attr, [node('SupplProvisionLabel', {}, ['附　則']), ...children]);
}

// ---------- 法令 ----------

export const SHOHI: LawFixture = {
  law_id: '363AC0000000108',
  title: '消費税法',
  law_num: '昭和六十三年法律第百八号',
};
export const SHOTOKU_REI: LawFixture = {
  law_id: '340CO0000000096',
  title: '所得税法施行令',
  law_num: '昭和四十年政令第九十六号',
  law_type: 'CabinetOrder',
};
export const SHOTOKU_KISOKU: LawFixture = {
  law_id: '340M50000040011',
  title: '所得税法施行規則',
  law_num: '昭和四十年大蔵省令第十一号',
  law_type: 'MinisterialOrdinance',
};
export const SHOTOKU: LawFixture = {
  law_id: '340AC0000000033',
  title: '所得税法',
  law_num: '昭和四十年法律第三十三号',
};
export const HOKEN: LawFixture = {
  law_id: '420AC0000000056',
  title: '保険法',
  law_num: '平成二十年法律第五十六号',
};
/** 2019 年に「情報通信技術を活用した行政の推進等に関する法律」へ改題した法律 */
export const GYOSEI_IT: LawFixture = {
  law_id: '414AC0000000151',
  title: '情報通信技術を活用した行政の推進等に関する法律',
  law_num: '平成十四年法律第百五十一号',
};
export const GYOSEI_IT_OLD_TITLE = '行政手続等における情報通信の技術の利用に関する法律';
export const KENKO_HOKEN: LawFixture = {
  law_id: '211AC0000000070',
  title: '健康保険法',
  law_num: '大正十一年法律第七十号',
};

/** 附則(27)・附則(168) の改正法の法令番号（2026-10-03 の e-Gov の消費税法） */
export const SUPPL_27_NUM = '平成八年六月一四日法律第八二号';
export const SUPPL_168_NUM = '令和八年三月三一日法律第一二号';
export const SUPPL_100_CAPTION = '（消費税法の一部改正に伴う経過措置）';

/**
 * 消費税法の本文。本則は第1条・第30条。附則は 168 本で、
 * 附則(1) は制定時（第1条）、附則(5) は条を立てず項だけ、附則(27)（抄）と附則(168) に第100条（項 2 つ、第1項に号 2 つ）
 */
export function shohiTree(): AnyObj {
  const suppl: AnyObj[] = [];
  for (let i = 1; i <= 168; i++) {
    if (i === 1) {
      suppl.push(supplProvision(null, [article('1', '第一条', [paragraph('1', '施行期日')])]));
    } else if (i === 27) {
      suppl.push(
        supplProvision(
          SUPPL_27_NUM,
          [
            article(
              '100',
              '第百条',
              [
                paragraph('1', '附則第百条第一項の本文', [
                  item('1', '一', '附則第百条第一項第一号の本文'),
                  item('2', '二', '附則第百条第一項第二号の本文'),
                ]),
                paragraph('2', '附則第百条第二項の本文'),
              ],
              SUPPL_100_CAPTION
            ),
          ],
          true
        )
      );
    } else if (i === 168) {
      suppl.push(
        supplProvision(SUPPL_168_NUM, [
          article('100', '第百条', [paragraph('1', '附則(168)の第百条の本文')]),
        ])
      );
    } else if (i === 5) {
      suppl.push(
        supplProvision(`平成元年一月${i}日法律第${i}号`, [paragraph('1', '項だけの附則')])
      );
    } else {
      suppl.push(
        supplProvision(`平成元年一月${i}日法律第${i}号`, [
          article('1', '第一条', [paragraph('1', `附則(${i})の第一条`)]),
        ])
      );
    }
  }
  return lawTree(
    SHOHI.title,
    [
      article('1', '第一条', [paragraph('1', '本則の第一条')], '（趣旨）'),
      article(
        '30',
        '第三十条',
        [paragraph('1', '本則の第三十条')],
        '（仕入れに係る消費税額の控除）'
      ),
    ],
    suppl
  );
}

// ---------- /laws の差し替え ----------

export interface LawsTable {
  /** e-Gov が持つ法令（現在の題名） */
  laws: LawFixture[];
  /** asof ごとの題名の置き換え（law_id → その時点の題名）。asof を付けた検索だけがこれを使う */
  asofTitles?: Record<string, Record<string, string>>;
}

/** `/laws` に部分一致・limit・offset・asof・law_num で答える */
export function lawsSearch(table: LawsTable, url: URL): Response {
  const title = url.searchParams.get('law_title');
  const num = url.searchParams.get('law_num');
  const asof = url.searchParams.get('asof');
  const limit = Number(url.searchParams.get('limit') ?? '100');
  const offset = Number(url.searchParams.get('offset') ?? '0');
  const renamed = asof ? (table.asofTitles?.[asof] ?? {}) : {};
  // e-Gov は旧題名でも引ける。返す題名は、その時点（asof が無ければ今）の題名
  const oldTitles = (lawId: string): string[] =>
    Object.values(table.asofTitles ?? {})
      .map((m) => m[lawId])
      .filter((t): t is string => typeof t === 'string');
  const hits = table.laws
    .filter((l) => {
      if (num) return l.law_num === num;
      if (title) return [l.title, ...oldTitles(l.law_id)].some((t) => t.includes(title));
      return true;
    })
    .map((l) => ({ ...l, title: renamed[l.law_id] ?? l.title }));
  const page = hits.slice(offset, offset + limit);
  return json({
    total_count: hits.length,
    count: page.length,
    laws: page.map(lawListItem),
  });
}

/** 題名に「保険法」を含む 114 件。完全一致の保険法は 78 件目（先頭は健康保険法） */
export function hokenLaws(): LawFixture[] {
  const out: LawFixture[] = [KENKO_HOKEN];
  for (let i = 2; i <= 114; i++) {
    if (i === 78) {
      out.push(HOKEN);
      continue;
    }
    out.push({
      law_id: `499AC${String(i).padStart(10, '0')}`,
      title: `架空${i}保険法`,
      law_num: `令和九十九年法律第${i}号`,
    });
  }
  return out;
}

/** e-Gov の 4xx の応答本文（JSON の code と message） */
export function egovError(status: number, code: string, message: string): Response {
  return json({ code, message }, status);
}
export const NOT_FOUND_404004 = (): Response =>
  egovError(404, '404004', '指定のパラメータで取得できる法令本文ファイルは存在しません。');
export const NOT_FOUND_404001 = (): Response => egovError(404, '404001', '取得結果が０件です。');
export const ASOF_400044_MESSAGE = '法令の時点（asof）には2017-04-01以降を指定してください。';
export const ASOF_400044 = (): Response => egovError(400, '400044', ASOF_400044_MESSAGE);
