/**
 * 士業の業務独占規定（業法）に関する構造化ナレッジ。
 *
 * houki-hub-mcp が「個人利用のセカンドオピニオン・ツール」として設計されている以上、
 * **どこからが士業の独占業務か** を利用者が把握できることが重要。
 * 「個人が自分の案件を調べる」のは規制外だが、有償×個別具体×業として行うと
 * 各業法が定める独占業務に抵触する。
 *
 * このナレッジは `explain_business_law_restriction` ツールで返却され、
 * 詳細な解説は `docs/LAW-HIERARCHY.md` および `DISCLAIMER.md` を参照。
 *
 * **重要**: 本データは法令の概要を示すものであり、個別事案の判断は有資格者に
 * 相談すること。境界事例は判例・通達でも解釈が分かれることがある。
 */

export interface BusinessLawRestriction {
  /** 士業の名称 */
  profession: string;
  /** 根拠法令名 */
  law_name: string;
  /** 独占規定の条文 */
  clause: string;
  /** 独占される行為（条文の趣旨をやさしく要約） */
  monopoly_act_summary: string;
  /** 独占規定が発動する要件（AND 条件） */
  triggers: string[];
  /** 違反時の罰則 */
  penalty: string;
  /** 規制外の典型例（個人や非業務での利用パターン） */
  safe_examples: string[];
  /** 違反になり得る典型例 */
  unsafe_examples: string[];
  /** 出典URL（e-Gov 法令検索） */
  law_url: string;
  /** 補足注意点 */
  notes?: string[];
}

export const BUSINESS_LAW_RESTRICTIONS: Record<string, BusinessLawRestriction> = {
  弁護士: {
    profession: '弁護士',
    law_name: '弁護士法',
    clause: '第72条',
    monopoly_act_summary:
      '報酬を得る目的で、訴訟・非訟・行政不服申立てその他一般の法律事件に関して、鑑定・代理・仲裁・和解その他の法律事務を取り扱うこと。これらの周旋（あっせん）も含む。',
    triggers: ['報酬目的（有償性）', '法律事件性（個別具体的な事件）', '反復継続（業として）'],
    penalty: '2年以下の拘禁刑または300万円以下の罰金（弁護士法77条3号）',
    safe_examples: [
      '個人が自分自身の案件を調べる',
      '無償で家族・友人に法律情報を伝える',
      '会社員が自社の社内法務として業務を補助する',
      '報道・教育目的の一般的な法律解説',
    ],
    unsafe_examples: [
      '資格なしに報酬を得て他人の法律相談を業として受ける',
      '報酬を得て契約書作成・交渉代行を業として行う',
      '報酬を得て他人の訴訟手続を代理する',
    ],
    law_url: 'https://laws.e-gov.go.jp/law/324AC0000000205',
    notes: [
      '「法律事件」の定義は判例・学説でも幅がある。境界事例は要相談',
      '会社員が自社の業務として行う社内法務は、対外的に独立して受任していないため通常は規制外',
      '隣接士業（司法書士・行政書士等）には個別の業務範囲がある',
    ],
  },

  税理士: {
    profession: '税理士',
    law_name: '税理士法',
    clause: '第52条',
    monopoly_act_summary:
      '税理士でない者が、税務代理・税務書類の作成・税務相談（税理士業務）を業として行うこと。無償・有償を問わず、業として行えば規制対象。',
    triggers: ['税務代理／税務書類作成／税務相談に該当', '反復継続（業として）'],
    penalty: '2年以下の拘禁刑または100万円以下の罰金（税理士法59条1項4号）',
    safe_examples: [
      '個人が自分の確定申告のために税務を調べる',
      '会社員が勤務先の経理として社内の税務処理を補助',
      '税理士の指導下での補助業務',
      '一般的な税法の教育・解説（個別の税務判断を伴わないもの）',
    ],
    unsafe_examples: [
      '無償でも他人の確定申告書を業として作成する（税理士法は無償でも独占）',
      '他人の税務相談を業として受ける',
      'AI ツールを介して有償で他人の税務代理を行う',
    ],
    law_url: 'https://laws.e-gov.go.jp/law/326AC0000000237',
    notes: [
      '**税理士法は他の士業法と違い「無償でも」独占**。「無償だから大丈夫」とは言えない',
      '個人事業主が自分の青色申告を houki-hub-mcp + LLM で行うのは規制外',
      'クラウド会計ソフトの提供と税務代理の境界は実務的に曖昧 — 個別事案判断には税理士へ',
    ],
  },

  社会保険労務士: {
    profession: '社会保険労務士（社労士）',
    law_name: '社会保険労務士法',
    clause: '第27条',
    monopoly_act_summary:
      '労働社会保険諸法令に基づく申請書等の作成・提出代行（1号業務・2号業務）を、報酬を得て業として行うこと。',
    triggers: ['労働社会保険諸法令の申請書等の作成・提出', '報酬目的', '反復継続（業として）'],
    penalty: '1年以下の拘禁刑または100万円以下の罰金（社会保険労務士法32条の2第1項）',
    safe_examples: [
      '事業主が自社の従業員のために自ら申請書を作成・提出',
      '会社員が勤務先の人事・総務として申請業務を行う',
      '無償で家族・友人を手伝う',
      '相談業務（3号業務）— ただし相談の独占は無く誰でも行える',
    ],
    unsafe_examples: [
      '資格なしに報酬を得て他人の労働基準監督署への36協定提出を代行',
      '報酬を得て他社の社会保険算定基礎届を業として作成',
    ],
    law_url: 'https://laws.e-gov.go.jp/law/343AC0000000089',
    notes: [
      '3号業務（労務管理・社会保険諸法令に関する相談・指導）は独占ではないので無資格でも可',
      '事業主自身が自社のために行う場合は規制外（自己使用）',
    ],
  },

  公認会計士: {
    profession: '公認会計士',
    law_name: '公認会計士法',
    clause: '第2条第1項',
    monopoly_act_summary: '財務書類の監査または証明を業として行うこと（監査証明業務の独占）。',
    triggers: ['財務書類の監査・証明', '反復継続（業として）'],
    penalty: '2年以下の拘禁刑または100万円以下の罰金（公認会計士法47条の2）',
    safe_examples: [
      '内部監査・経理担当者による社内チェック',
      '財務書類の作成・記帳代行（監査ではない）',
      '一般的な会計知識の教育',
    ],
    unsafe_examples: [
      '資格なしに上場企業等の財務書類監査を業として実施',
      '資格なしに会社法・金商法上の法定監査を行う',
    ],
    law_url: 'https://laws.e-gov.go.jp/law/323AC0000000103',
    notes: [
      '財務書類の作成・記帳は独占ではない（経理代行・記帳代行業者が存在するのはこのため）',
      '監査と「会計コンサルティング」「税務」は別物',
    ],
  },

  司法書士: {
    profession: '司法書士',
    law_name: '司法書士法',
    clause: '第3条・第73条',
    monopoly_act_summary:
      '登記・供託の申請、それに関する法務局・裁判所への提出書類の作成等を、業として行うこと。',
    triggers: ['登記等の手続代理・書類作成', '報酬目的', '反復継続（業として）'],
    penalty: '1年以下の拘禁刑または100万円以下の罰金（司法書士法78条1項）',
    safe_examples: [
      '個人が自分の不動産登記・会社登記を自分で申請（本人申請）',
      '会社が自社の役員変更登記を社内で行う',
    ],
    unsafe_examples: [
      '資格なしに報酬を得て他人の登記申請書を業として作成・代行',
      '報酬を得て不動産登記の業務を継続的に提供',
    ],
    law_url: 'https://laws.e-gov.go.jp/law/325AC0000000197',
    notes: ['本人申請は完全に合法（時間と労力はかかるが）', '簡裁訴訟代理権は認定司法書士のみ'],
  },

  行政書士: {
    profession: '行政書士',
    law_name: '行政書士法',
    clause: '第1条の2・第19条',
    monopoly_act_summary:
      '官公署に提出する書類その他権利義務又は事実証明に関する書類を、報酬を得て業として作成すること。',
    triggers: ['官公署提出書類等の作成', '報酬目的', '反復継続（業として）'],
    penalty: '1年以下の拘禁刑または100万円以下の罰金（行政書士法21条）',
    safe_examples: [
      '個人が自分の許認可申請書を自分で作成',
      '会社員が勤務先の許認可申請を社内で作成',
      '無償の補助',
    ],
    unsafe_examples: [
      '資格なしに報酬を得て建設業許可申請書を業として作成',
      '報酬を得て他人の遺産分割協議書を業として作成（弁護士・司法書士の独占と重なる場合あり）',
    ],
    law_url: 'https://laws.e-gov.go.jp/law/326AC0000000004',
    notes: [
      '他士業の独占業務（登記・税務・労務等）は行政書士でも扱えない',
      '書類作成の「業として」の要件は実務的に解釈の幅がある',
    ],
  },

  弁理士: {
    profession: '弁理士',
    law_name: '弁理士法',
    clause: '第75条',
    monopoly_act_summary:
      '特許庁における特許・実用新案・意匠・商標等の手続代理を、報酬を得て業として行うこと。',
    triggers: ['特許庁等への手続代理', '報酬目的', '反復継続（業として）'],
    penalty: '1年以下の拘禁刑または100万円以下の罰金（弁理士法79条）',
    safe_examples: [
      '発明者が自分の特許出願を自分で行う',
      '会社員が自社の知財部として特許出願実務を行う',
      '一般的な知財制度の教育・解説',
    ],
    unsafe_examples: [
      '資格なしに報酬を得て他人の特許出願を業として代理',
      '報酬を得て商標登録出願の代理を業として実施',
    ],
    law_url: 'https://laws.e-gov.go.jp/law/412AC0000000049',
    notes: ['本人出願は合法。ただし実務上は弁理士に依頼するのが一般的'],
  },
};

/**
 * 名前から業法エントリを検索（士業名・法令名・aliases に対応）
 */
export function findBusinessLawRestriction(name: string): BusinessLawRestriction | null {
  const trimmed = name.trim();
  // 士業名で完全一致
  if (BUSINESS_LAW_RESTRICTIONS[trimmed]) {
    return BUSINESS_LAW_RESTRICTIONS[trimmed];
  }
  // 法令名・略称で検索
  for (const entry of Object.values(BUSINESS_LAW_RESTRICTIONS)) {
    if (entry.law_name === trimmed) return entry;
    if (entry.profession.includes(trimmed)) return entry;
  }
  // 略称マッピング
  const aliases: Record<string, string> = {
    弁護士法: '弁護士',
    税理士法: '税理士',
    社労士: '社会保険労務士',
    社労士法: '社会保険労務士',
    社会保険労務士法: '社会保険労務士',
    会計士: '公認会計士',
    公認会計士法: '公認会計士',
    司法書士法: '司法書士',
    行政書士法: '行政書士',
    弁理士法: '弁理士',
  };
  if (aliases[trimmed]) {
    return BUSINESS_LAW_RESTRICTIONS[aliases[trimmed]];
  }
  return null;
}

/** 全士業のリスト */
export function listBusinessLawProfessions(): string[] {
  return Object.keys(BUSINESS_LAW_RESTRICTIONS);
}
