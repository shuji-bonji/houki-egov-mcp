# 差分: explain_law_type（20260928-untested-behaviors）

`specs/current/explain_law_type/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-EXPLAIN-LAW-TYPE-011 `found: true` の応答は `related_tools` を持つ

SPEC-EGOV-EXPLAIN-LAW-TYPE-001・002・003 の応答（`found: true`）は、`related_tools: ["search_law", "get_law", "get_toc"]` を持つ。どの種別でも同じ配列を、この順で返す。

例: `name: "政令"` も `name: "通達"` も `related_tools` は `["search_law", "get_law", "get_toc"]`。

（同じ応答の `see_also` は houki-egov-mcp #56 で扱うので、この ID では約束にしない。）

### SPEC-EGOV-EXPLAIN-LAW-TYPE-012 `info` の任意のフィールド `aliases`・`law_type_code`・`notes`

`info` は、SPEC-EGOV-EXPLAIN-LAW-TYPE-006 のフィールドのほかに、種別によって次のフィールドを持つ。

| フィールド      | 内容                                                                             |
| --------------- | -------------------------------------------------------------------------------- |
| `aliases`       | 別名の配列（文字列）                                                             |
| `law_type_code` | e-Gov の法令種別コード（文字列）                                                 |
| `notes`         | 補足の注意の配列（文字列）。1 件以上                                             |

`法律` の `law_type_code` は `Act`、`政令` は `CabinetOrder`、`省令` は `MinisterialOrdinance`。

例: `name: "政令"` の `info` は `aliases: ["施行令", "CabinetOrder"]`・`law_type_code: "CabinetOrder"`・`notes`（1 件）を持つ。`name: "法律"` の `info` は `law_type_code: "Act"` を持ち、`aliases` と `notes` を持たない。`name: "憲法"` の `info` は `aliases: ["日本国憲法"]` を持ち、`law_type_code` を持たない。

### SPEC-EGOV-EXPLAIN-LAW-TYPE-013 `sources` の要素は `label` と `url` を持ち、`url` は空文字のことがある

`info.sources` の各要素は `label`（取得元の名前）と `url`（文字列）を持つ。Web 上の場所を 1 つに決められない取得元（自治体の例規集・各省庁のウェブサイトなど）は `url: ""`。

例: `name: "憲法"` の `sources` は `[{ label: "e-Gov 法令検索", url: "https://laws.e-gov.go.jp/law/321CONSTITUTION" }]`。`name: "条例"` の `sources` は `[{ label: "各自治体の例規集（自治体ウェブサイト）", url: "" }]`。`name: "規則"` の `sources` の 2 件目は `{ label: "各自治体例規集", url: "" }`。

### SPEC-EGOV-EXPLAIN-LAW-TYPE-014 `found: false` の応答は、収録している種別の名前を `next_actions` で示す

SPEC-EGOV-EXPLAIN-LAW-TYPE-005 の応答（`found: false`）は `next_actions` を持つ。`next_actions` は 1 件で、`action: "list_known_law_types"`・`reason: "知られている法令種別は次のとおり"`・`example.names`（収録している種別の名前の配列）を持つ。`example.names` の名前と順は、`hint` の `試せる名前: ` の後に並べた名前と同じ。

例: `name: "架空法令"` の `next_actions[0].action` は `list_known_law_types` で、`example.names` は `憲法`・`法律`・`政令`・`省令`・`規則`・`条例`・`告示`・`訓令`・`通達` を含み、`example.names.join(", ")` は `hint` の `試せる名前: ` より後ろの文字列と同じ。

（同じ応答の `see_also` は houki-egov-mcp #56 で扱うので、この ID では約束にしない。）

### SPEC-EGOV-EXPLAIN-LAW-TYPE-015 応答の `name` は渡した値のまま返す

応答の `name` には、前後の空白を除く前の、渡した値をそのまま入れる。`info.name` は種別の主名。`found: false` のときも、応答の `name` は渡した値のまま。

例: `name: " 政令 "` は応答の `name` が `" 政令 "` で、`info.name` は `"政令"`。`name: "施行令"` は応答の `name` が `"施行令"` で、`info.name` は `"政令"`。`name: "架空法令"` は応答の `name` が `"架空法令"`（`found: false`）。

### SPEC-EGOV-EXPLAIN-LAW-TYPE-016 大文字と小文字、全角と半角を区別して照合する

種別の名前・別名・法令種別コードとの照合では、英字の大文字と小文字、全角と半角を同じ文字として扱わない。一致しなければ SPEC-EGOV-EXPLAIN-LAW-TYPE-005 の `found: false` を返す。

例: `name: "Act"` は `info.name: "法律"`（`found: true`）。`name: "act"`・`name: "ACT"`・`name: "ＡＣＴ"` は、どれも `found: false`。

### SPEC-EGOV-EXPLAIN-LAW-TYPE-017 府令・内閣府令は省令、基本通達・取扱通達は通達の解説を返す

SPEC-EGOV-EXPLAIN-LAW-TYPE-002 の別名には、次のものも含む。

| `name`     | `info.name` |
| ---------- | ----------- |
| `府令`     | `省令`      |
| `内閣府令` | `省令`      |
| `基本通達` | `通達`      |
| `取扱通達` | `通達`      |

例: `name: "府令"` は `found: true`・`info.name: "省令"`・`info.enacting_body: "各省大臣／内閣府の主任の大臣"`。`name: "取扱通達"` は `found: true`・`info.name: "通達"`・`info.binds_citizens: false`。

（`通知` を `通達` の別名として扱うかは houki-egov-mcp #62 で扱うので、この ID では約束にしない。）
