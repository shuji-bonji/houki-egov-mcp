/**
 * MCP Tool Definitions
 *
 * inputSchema は `as const` で書き、引数の型は `ArgsOf<typeof xxxTool.inputSchema>` で導く（v0.6.0）。
 * すべての inputSchema に `additionalProperties: false` を付け、未知の引数は INVALID_ARGUMENT にする。
 */
import type { Tool } from '@modelcontextprotocol/server';
import {
  DOMAINS,
  LAW_FILE_TYPES,
  LIMITS,
  OUTPUT_FORMATS,
  RANGE_LIMITS,
  SCAN_BODY_SECONDS,
  SUPPL_MODES,
} from '../constants.js';
import { type ToolSpec, toMcpTool } from './tool-args.js';

// ========================================
// Phase 1: Core (e-Gov API v2)
// ========================================
export const searchLawTool = {
  name: 'search_law',
  description:
    '日本の法令をキーワード・略称・分野で検索する。e-Gov法令API v2 を使用。略称辞書による正式名称への自動補完あり。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description:
          '検索キーワード。例: "消費税", "労働基準", "育児休業"。略称も可（例: "消法", "労基法"）',
      },
      law_type: {
        type: 'string',
        enum: ['Act', 'CabinetOrder', 'ImperialOrdinance', 'MinisterialOrdinance', 'Rule'],
        description: '法令種別で絞り込み',
      },
      domain: {
        type: 'string',
        enum: [...DOMAINS],
        description: '分野タグで絞り込み（略称辞書ベース）',
      },
      limit: {
        type: 'number',
        description: `取得件数（デフォルト: ${LIMITS.searchDefault}、最大: ${LIMITS.searchMax}）`,
        default: LIMITS.searchDefault,
      },
    },
    required: ['keyword'],
    additionalProperties: false,
  },
} as const satisfies ToolSpec;

export const getLawTool = {
  name: 'get_law',
  description:
    '日本の法令から条文を取得する。略称（消法・所法・労基法 等）対応。条/項/号レベル指定可能。章・節をまとめて取るときは get_law_range を使う。',
  inputSchema: {
    type: 'object',
    properties: {
      law_name: {
        type: 'string',
        description: '法令名または略称。例: "消費税法", "消法", "労基法", "民法"',
      },
      article: {
        type: 'string',
        description:
          '条番号。例: "30", "30の2", "第30条の2"。漢数字（"第三十条", "三十の二"）と全角数字も可（v0.7.0）。format="toc" の場合は省略可',
      },
      paragraph: {
        type: 'number',
        description: '項番号。省略時は条文全体',
      },
      item: {
        type: ['number', 'string'],
        description:
          '号番号。数値（8）か文字列（"8"・"8の2"・"第8号の2"・"八の二"）。枝番号の号（第8号の2）は文字列で指定する。漢数字と全角数字も可（v0.7.0）。項が複数ある条では paragraph も指定する（項が 1 つの条では省略可）。省略時は項全体',
      },
      format: {
        type: 'string',
        enum: [...OUTPUT_FORMATS],
        description:
          '出力形式。"markdown"=条文全文（デフォルト）, "toc"=目次のみ（トークン節約）, "json"=構造化',
        default: 'markdown',
      },
      at: {
        type: 'string',
        description:
          '時点指定。YYYY-MM-DD 形式。例: "2024-04-01" でその時点の条文を取得（e-Gov v2 対応）',
      },
    },
    required: ['law_name'],
    additionalProperties: false,
  },
} as const satisfies ToolSpec;

export const getTocTool = {
  name: 'get_toc',
  description:
    '法令の目次（編・章・節・条の構造）のみを取得する。トークン節約用。本則は `toc`、附則は改正法ごとに `suppl_provisions` へ分けて返す（現行の規定と、改正法ごとの施行日・経過措置を混ぜないため）。既定では附則は見出しと条数だけを返し、`suppl: "full"` で附則の中の条まで返す。depth で階層を浅く打ち切れる（民法・会社法のような大規模法令の概観把握向け）。応答の toc[].path（例 "Part3/Chapter2"）は get_law_range にそのまま渡せる。',
  inputSchema: {
    type: 'object',
    properties: {
      law_name: {
        type: 'string',
        description: '法令名または略称',
      },
      at: {
        type: 'string',
        description: '時点指定（YYYY-MM-DD）',
      },
      depth: {
        type: 'number',
        description:
          '構造階層の打ち切り深さ。1=編まで、2=章まで、3=節まで。省略時は全階層。例: 民法を depth=1 で取得すると「第一編 総則」「第二編 物権」のような大区分のみが返る',
      },
      suppl: {
        type: 'string',
        enum: [...SUPPL_MODES],
        description:
          '附則をどこまで返すか。"list"（デフォルト）=改正法ごとの見出しと条数だけ、"full"=附則の中の条まで、"none"=附則を返さない。附則は改正法ごとに積み上がり、所得税法は 352 本・条 983 件あるため、既定では見出しだけを返す',
        default: 'list',
      },
      with_amend_titles: {
        type: 'boolean',
        description:
          '附則に改正法の題名を付ける（デフォルト: false）。附則の属性には法令番号しか無いため、改正履歴（get_law_revisions と同じ e-Gov の応答）を 1 回引いて法令番号で照合する。e-Gov の改正履歴は近年の改正が中心なので、それより古い改正法の題名は付かない（付いた本数と付かなかった本数は応答の suppl.amend_law_titles に入る）',
        default: false,
      },
    },
    required: ['law_name'],
    additionalProperties: false,
  },
} as const satisfies ToolSpec;

export const searchFulltextTool = {
  name: 'search_fulltext',
  description:
    '法令の条文本文をキーワードで横断全文検索する（ローカル SQLite FTS5）。`houki-egov-mcp --bulk-download-everything` で構築した bulk DB を引き、略称は正式名称に OR 展開（例: "消法" → "消費税法"）。各ヒットに条番号・snippet・score・DB の鮮度 (freshness) を付けて返す。bulk DB 未構築時は search_law（法令名のタイトル一致）にフォールバックし、その旨を note で返す。2 文字の語（「相殺」「時効」）は本文の索引（trigram）に載らないため既定では本文を引かず、何をして結果を出したかを応答の short_tokens に返す。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description:
          '検索キーワード。スペース区切りで AND 検索。法令名・略称を含めると（例: "民法 不法行為", "労基法 時間外"）その法令の条に絞って本文を検索する。「第30条」を含めると該当条番号のヒットを上位に寄せ、法令名 + 条番号だけ（例: "民法 第709条"）ならその条を直接返す（漢数字は未対応）。2 文字の語だけのとき（例: "相殺"）は索引を引けないため、既定では条本文を引かず法令名の照合だけを返す。法令名か 3 文字以上の語を添えると索引で本文を引ける',
      },
      domain: {
        type: 'string',
        enum: [...DOMAINS],
        description:
          '分野タグ。v0.5.0 では受け付けるが絞り込みは行わない（bulk DB の category 列が未投入のため。Phase 2-13 で実効化）',
      },
      law_type: {
        type: 'string',
        enum: ['Act', 'CabinetOrder', 'ImperialOrdinance', 'MinisterialOrdinance', 'Rule'],
        description: '法令種別で絞り込み',
      },
      limit: {
        type: 'number',
        description: `取得件数（デフォルト: ${LIMITS.fulltextDefault}、最大: ${LIMITS.fulltextMax}）`,
        default: LIMITS.fulltextDefault,
      },
      scan_body: {
        type: 'boolean',
        description: `2 文字の語だけのクエリ（例: "相殺"）で、索引を使わずに全法令の条本文を端から照合する（デフォルト: false）。索引を引けない語の本文を探す最後の手段で、${SCAN_BODY_SECONDS}かかり、並び順も関連度順にならない。法令名を添えられるなら（例: "民法 相殺"）そちらが速く正確。3 文字以上の語を含むクエリでは索引を引くので、この引数は効かない`,
        default: false,
      },
    },
    required: ['keyword'],
    additionalProperties: false,
  },
} as const satisfies ToolSpec;

export const resolveAbbreviationTool = {
  name: 'resolve_abbreviation',
  description:
    '略称・通称から正式な法令名と law_id を解決する。略称辞書の内容を確認するための診断ツール。',
  inputSchema: {
    type: 'object',
    properties: {
      abbr: {
        type: 'string',
        description: '略称。例: "消法", "所法", "労基法", "民"',
      },
    },
    required: ['abbr'],
    additionalProperties: false,
  },
} as const satisfies ToolSpec;

export const getLawRevisionsTool = {
  name: 'get_law_revisions',
  description:
    '法令の改正履歴を取得する。e-Gov v2 /law_revisions を使用。各改正の公布日・施行日・改正法令番号・状態（現行/旧法/未施行）等を返す。',
  inputSchema: {
    type: 'object',
    properties: {
      law_name: {
        type: 'string',
        description: '法令名または略称。例: "消費税法", "消法", "民法"',
      },
      latest: {
        type: 'number',
        description: '最新N件のみ返却（省略時は全件）。例: 5',
      },
    },
    required: ['law_name'],
    additionalProperties: false,
  },
} as const satisfies ToolSpec;

export const explainLawTypeTool = {
  name: 'explain_law_type',
  description:
    '法令種別（憲法・法律・政令・省令・規則・条例・告示・通達 等）の制定主体・階層上の位置・国民への拘束力・実務上の注意点を解説する。法務専門家でない利用者が「政令と省令の違い」「通達は守らなくていいのか」等を確認するための知識ツール。',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description:
          '法令種別の名前。例: "法律", "政令", "省令", "規則", "条例", "告示", "通達", "訓令", "憲法"。aliases も解決可（例: "施行令" → 政令、"施行規則" → 省令、"Act" → 法律）',
      },
    },
    required: ['name'],
    additionalProperties: false,
  },
} as const satisfies ToolSpec;

// ========================================
// egov#20: 施行令・施行規則の関連付けと条文内の参照抽出（v0.10.0）
// ========================================
export const getRelatedLawsTool = {
  name: 'get_related_laws',
  description:
    '法令名の規則で関連する法令を引く。法律なら施行令・施行規則、施行令・施行規則なら親の法律と兄弟を、e-Gov に実在するものだけ返す（law_id 付き）。名前の末尾に「施行令」「施行規則」を付けた（落とした）候補だけを試すので、別の名前の下位法令や告示は返らない。網羅性は主張しない。',
  inputSchema: {
    type: 'object',
    properties: {
      law_name: {
        type: 'string',
        description: '法令名または略称。例: "所得税法", "所法", "所得税法施行令"',
      },
    },
    required: ['law_name'],
    additionalProperties: false,
  },
} as const satisfies ToolSpec;

export const getArticleReferencesTool = {
  name: 'get_article_references',
  description:
    '条文本文が引用している参照を取り出す。他法令の条（法令名と法令番号から law_id を解決）、同一法令内の条・項・号、「政令で定める」「財務省令で定める」の委任（施行令・施行規則を法令単位で付ける）を返し、各参照に get_law の引数を next_actions で付ける。「前項」「同法」は解決しない。正規表現で取れた範囲だけを返し、網羅性は主張しない。',
  inputSchema: {
    type: 'object',
    properties: {
      law_name: {
        type: 'string',
        description: '法令名または略称。例: "所得税法", "所法"',
      },
      article: {
        type: 'string',
        description: '条番号。例: "57の2", "第57条の2", "第五十七条の二"',
      },
      paragraph: {
        type: 'number',
        description: '項番号。指定するとその項の本文だけを対象にする。省略時は条全体',
      },
      at: {
        type: 'string',
        description: '時点指定。YYYY-MM-DD 形式（get_law と同じ）',
      },
    },
    required: ['law_name', 'article'],
    additionalProperties: false,
  },
} as const satisfies ToolSpec;

// ========================================
// egov#18: 引用の実在確認（v0.11.0）
// ========================================
export const verifyCitationsTool = {
  name: 'verify_citations',
  description:
    'LLM が組み立てた法令の引用リストを、1 回の呼び出しでまとめて実在確認する。件ごとに found / not_found / ambiguous を返し、リストの中に存在しない引用が混ざっていてもツール全体はエラーにしない。found の件には正式名称・法令番号・条見出し・law_id・URL を付ける。確かめるのは「その条（指定があれば項・号）が e-Gov の法令にあるか」だけで、引用が主張を支えるかどうかは判定しない。略称は略称辞書で正式名称に直してから照合する。',
  inputSchema: {
    type: 'object',
    properties: {
      citations: {
        type: 'array',
        description: `確かめたい引用の配列（最大 ${LIMITS.citationsMax} 件）`,
        minItems: 1,
        maxItems: LIMITS.citationsMax,
        items: {
          type: 'object',
          properties: {
            law_name: {
              type: 'string',
              description: '法令名または略称。例: "所得税法", "所法"。law_id を書くなら省略可',
            },
            law_id: {
              type: 'string',
              description:
                'e-Gov の law_id。例: "340AC0000000033"。law_name より優先する。law_name と両方省略はできない',
            },
            article: {
              type: 'string',
              description: '条番号。例: "30", "30の2", "第三十条の二"',
            },
            paragraph: {
              type: 'number',
              description: '項番号。省略すると条までを確かめる',
            },
            item: {
              type: ['number', 'string'],
              description:
                '号番号。数値（8）か文字列（"8"・"8の2"・"八の二"）。項が複数ある条で項を書かずに号だけを指定すると ambiguous になる',
            },
            label: {
              type: 'string',
              description: '引用元の表示文字列。判定には使わず、そのまま results に返す',
            },
          },
          required: ['article'],
          additionalProperties: false,
        },
      },
      at: {
        type: 'string',
        description: '時点指定。YYYY-MM-DD 形式。全件に同じ時点を適用する',
      },
    },
    required: ['citations'],
    additionalProperties: false,
  },
} as const satisfies ToolSpec;

// ========================================
// egov#22: 章・節単位の分割取得（v0.14.0）
// ========================================
export const getLawRangeTool = {
  name: 'get_law_range',
  description:
    '法令の編・章・節・款・目のいずれか、または附則 1 本を範囲にして、その中の条を本文ごと取得する。1 条ずつ引く get_law と、目次だけを返す get_toc の間を埋める（民法・会社法・消費税法のように get_law で 1 条ずつ引くと手数がかかり、法令全体では長すぎる場合に使う）。範囲は条の単位で文字数の上限まで返し、入り切らなかったときは truncated と続きの条番号（next_from_article）を返す。返した範囲（パス・見出し・条の数・最初と最後の条）は応答の range に入る。',
  inputSchema: {
    type: 'object',
    properties: {
      law_name: {
        type: 'string',
        description: '法令名または略称。例: "民法", "会社法", "消法"',
      },
      part: {
        type: ['string', 'number'],
        description:
          '編の番号。"3" / 3 / "三" / "第三編" / 枝番号は "2の2"。上位の階層は無いので単独で指定できる',
      },
      chapter: {
        type: ['string', 'number'],
        description:
          '章の番号。章番号は編ごとに振り直されるため（民法には第一章が 5 つある）、編を持つ法令では part も指定する。指定が複数の範囲に当たるときは、候補のパスを付けた INVALID_ARGUMENT を返す',
      },
      section: {
        type: ['string', 'number'],
        description: '節の番号。上位の part / chapter も指定すると範囲が一つに決まる',
      },
      subsection: {
        type: ['string', 'number'],
        description: '款の番号',
      },
      division: {
        type: ['string', 'number'],
        description: '目の番号',
      },
      path: {
        type: 'string',
        description:
          '範囲のパス。get_toc が返す toc[].path をそのまま渡せる。例: "Part3/Chapter2"（民法第三編第二章）、"Chapter2/Section1/Subsection2"。編・章・節の番号との同時指定はできない',
      },
      suppl_index: {
        type: 'number',
        description:
          '附則の番号（1 始まり）。get_toc が返す suppl_provisions[].index と同じ番号で、search_fulltext が「附則(3) 1」と表示する番号でもある。条を持たず項だけで書かれた附則は、範囲の本文をそのまま返す',
      },
      from_article: {
        type: 'string',
        description:
          '範囲の中のこの条から返す。前の応答が truncated だったときに next_from_article の値を渡して続きを取る。例: "561", "548の4", "第五百六十一条"',
      },
      max_chars: {
        type: 'number',
        description: `返す条本文の文字数の上限（デフォルト: ${RANGE_LIMITS.defaultMaxChars}、${RANGE_LIMITS.minMaxChars}〜${RANGE_LIMITS.maxMaxChars}）。条の途中では切らないため、1 条目だけは上限を超えても返す`,
        minimum: RANGE_LIMITS.minMaxChars,
        maximum: RANGE_LIMITS.maxMaxChars,
        default: RANGE_LIMITS.defaultMaxChars,
      },
      at: {
        type: 'string',
        description: '時点指定。YYYY-MM-DD 形式（get_law と同じ）',
      },
    },
    required: ['law_name'],
    additionalProperties: false,
  },
} as const satisfies ToolSpec;

// ========================================
// egov#19: 添付ファイルと法令本文ファイル（v0.15.0）
// ========================================
export const listAttachmentsTool = {
  name: 'list_attachments',
  description:
    '法令に付いている添付ファイル（別表・様式・別記の図。jpg / pdf）の一覧を返す。各ファイルに、認証なしで開ける取得 URL と、法令の中の置き場所（「別表第一（第一条関係）」「附録第十一号様式」のような見出しと関係条文、条の中なら条番号）を付ける。get_law の条文には図の中身が入らないので、別表・様式の図が要るときにこのツールで URL を取る。pdf は pdf-reader-mcp の read_url に url を渡して読める。ファイルの中身は返さない。',
  inputSchema: {
    type: 'object',
    properties: {
      law_name: {
        type: 'string',
        description: '法令名または略称。例: "戸籍法施行規則", "国旗及び国歌に関する法律"',
      },
      at: {
        type: 'string',
        description:
          '時点指定。YYYY-MM-DD 形式（get_law と同じ）。添付ファイルは法令履歴ごとに付くので、時点を変えると一覧も変わる',
      },
    },
    required: ['law_name'],
    additionalProperties: false,
  },
} as const satisfies ToolSpec;

export const getAttachmentTool = {
  name: 'get_attachment',
  description:
    '添付ファイル 1 件（src 指定）か、その法令履歴の添付ファイルをまとめた zip（src 省略）を取る。既定では e-Gov からファイルを取らず、URL とメタ情報（ファイル名・種別・置き場所）だけを返す。save: true のときだけファイルを取得してサーバー側の保存先（既定は XDG_CACHE_HOME か ~/.cache の下の houki-egov-mcp/files/。環境変数 HOUKI_EGOV_FILES_DIR で変更）に書き、絶対パスを返す。保存先はツールの引数では指定できない。base64 の中身は返さない。',
  inputSchema: {
    type: 'object',
    properties: {
      law_name: {
        type: 'string',
        description: '法令名または略称',
      },
      src: {
        type: 'string',
        description:
          'list_attachments が返す attachments[].src（例 "./pict/H11HO127-001.jpg"）。ファイル名だけ（"H11HO127-001.jpg"）でも引ける。省略すると添付ファイル全部の zip',
      },
      at: {
        type: 'string',
        description: '時点指定。YYYY-MM-DD 形式。list_attachments と同じ時点を渡す',
      },
      save: {
        type: 'boolean',
        description:
          'true でファイルを取得してディスクに保存し、応答の saved.path に絶対パスを返す（デフォルト: false）。false のときは URL だけを返し、e-Gov からファイルは取らない',
        default: false,
      },
    },
    required: ['law_name'],
    additionalProperties: false,
  },
} as const satisfies ToolSpec;

export const getLawFileTool = {
  name: 'get_law_file',
  description:
    '法令本文を 1 つのファイル（xml / json / html / rtf / docx）で取る道を返す。既定では認証なしで開ける URL だけを返し、save: true のときだけファイルを取得してサーバー側の保存先（既定は XDG_CACHE_HOME か ~/.cache の下の houki-egov-mcp/files/。環境変数 HOUKI_EGOV_FILES_DIR で変更）に書いて絶対パスを返す。条文を読むだけなら get_law / get_law_range のほうが小さく済む（民法の xml は 1.6 MB、docx は 182 KB）。人が Word や ブラウザーで開く版が要るとき（docx / html / rtf）と、法令 XML をそのまま処理したいとき（xml / json）のためのツール。',
  inputSchema: {
    type: 'object',
    properties: {
      law_name: {
        type: 'string',
        description: '法令名または略称。例: "民法", "消法"',
      },
      file_type: {
        type: 'string',
        enum: [...LAW_FILE_TYPES],
        description:
          'ファイル種別。xml = 法令標準 XML、json = e-Gov の JSON、html、rtf、docx（Word）',
      },
      at: {
        type: 'string',
        description:
          '時点指定。YYYY-MM-DD 形式。その時点以前で最新の履歴の本文ファイルになる（e-Gov の asof）',
      },
      save: {
        type: 'boolean',
        description:
          'true でファイルを取得してディスクに保存し、応答の saved.path に絶対パスを返す（デフォルト: false）。保存すると e-Gov のファイル名から法令履歴 ID（saved.law_revision_id）が分かる',
        default: false,
      },
    },
    required: ['law_name', 'file_type'],
    additionalProperties: false,
  },
} as const satisfies ToolSpec;

/** tools/list に出すツールの一覧（定義の順） */
export const tools: Tool[] = [
  searchLawTool,
  getLawTool,
  getTocTool,
  getLawRangeTool,
  searchFulltextTool,
  resolveAbbreviationTool,
  getLawRevisionsTool,
  explainLawTypeTool,
  getRelatedLawsTool,
  getArticleReferencesTool,
  verifyCitationsTool,
  listAttachmentsTool,
  getAttachmentTool,
  getLawFileTool,
].map(toMcpTool);
