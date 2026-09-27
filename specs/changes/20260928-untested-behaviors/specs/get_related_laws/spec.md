# 差分: get_related_laws（20260928-untested-behaviors）

`specs/current/get_related_laws/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-GET-RELATED-LAWS-009 related の要素に law_num・law_type・url を付ける

`related` の要素には、SPEC-EGOV-GET-RELATED-LAWS-001 の `relation`・`law_id`・`title`・`abbr` に加えて、e-Gov の法令番号 `law_num`、法令の種類 `law_type`（e-Gov の値のまま。例: `CabinetOrder`・`MinisterialOrdinance`・`Act`）、e-Gov 法令の公開ページの URL `url`（`https://laws.e-gov.go.jp/law/<law_id>`）を付ける。

例: `law_name: "所得税法"` の `related[0]` は `{ relation: "enforcement_order", law_id: "340CO0000000096", title: "所得税法施行令", law_num: "昭和四十年政令第九十六号", law_type: "CabinetOrder", abbr: "所令", url: "https://laws.e-gov.go.jp/law/340CO0000000096" }`。`related[1]` は `law_type: "MinisterialOrdinance"`、`url: "https://laws.e-gov.go.jp/law/340M50000040011"`。

### SPEC-EGOV-GET-RELATED-LAWS-010 成功の応答の meta.retrieved_at に応答を作った日時を入れる

成功の応答には `meta: { retrieved_at }` を付ける。`retrieved_at` は応答を作った日時の ISO 8601 形式の文字列（UTC、例: `2026-09-27T20:31:35.697Z`）。

例: `law_name: "所得税法"` の応答の `meta` は `retrieved_at` だけを持ち、その値は `new Date(retrieved_at).toISOString()` と同じ文字列になる。`related` が空の応答（`law_name: "民法"`）にも付く。

### SPEC-EGOV-GET-RELATED-LAWS-011 法令番号が分からないときは law.law_num を付けない

`law_name` を解決した法令の法令番号が分からないとき（e-Gov の法令名検索で解決し、その法令の法令番号が空の文字列のとき）は、`law` に `law_num` のキーを付けず、`law_id` と `title` だけを返す。

例: e-Gov の法令名検索が `{ law_id: "999AC0000000001", law_title: "番号無し法", law_num: "" }` を返すとき、`law_name: "番号無し法"` の `law` は `{ law_id: "999AC0000000001", title: "番号無し法" }`（`law_num` のキーが無い）。

### SPEC-EGOV-GET-RELATED-LAWS-012 next_actions の get_toc に、related の法令名と関係に応じた reason を付ける

SPEC-EGOV-GET-RELATED-LAWS-008 の `get_toc` の各要素は、`example: { law_name: <related の title> }` と、`relation` に応じた次の `reason` を持つ。

| `relation`          | `reason`                                         |
| ------------------- | ------------------------------------------------ |
| `parent_act`        | `親の法律の目次を見て、委任している条を探せます` |
| `enforcement_order` | `施行令の目次を見て、委任先の条を探せます`       |
| `enforcement_rule`  | `施行規則の目次を見て、委任先の条を探せます`     |

例: `law_name: "所得税法"` の `next_actions` は `[{ action: "get_toc", reason: "施行令の目次を見て、委任先の条を探せます", example: { law_name: "所得税法施行令" } }, { action: "get_toc", reason: "施行規則の目次を見て、委任先の条を探せます", example: { law_name: "所得税法施行規則" } }]`。`law_name: "所令"` の `next_actions[0]` は `{ action: "get_toc", reason: "親の法律の目次を見て、委任している条を探せます", example: { law_name: "所得税法" } }`。

### SPEC-EGOV-GET-RELATED-LAWS-013 houki-egov-mcp の管轄外の略称はエラー `OUT_OF_SCOPE` で、管轄の MCP を案内する

`law_name` が略称辞書で houki-egov-mcp 以外の管轄（`source_mcp_hint` が `houki-egov` でない）の名前のときは、e-Gov に問い合わせずにエラー `OUT_OF_SCOPE` を返す。`hint` は `<管轄>-mcp の対応 tool に切り替えてください`、`next_actions` は `action: "delegate_to_mcp"`、`example: { mcp: <管轄> }` の 1 件。

例: `law_name: "消基通"` は `{ code: "OUT_OF_SCOPE", error: "「消費税法基本通達」は houki-nta の管轄です（houki-egov-mcp は法律・政令・省令の本文のみを扱います）", hint: "houki-nta-mcp の対応 tool に切り替えてください", next_actions: [{ action: "delegate_to_mcp", example: { mcp: "houki-nta" }, … }] }`。e-Gov への問い合わせは 0 回。

### SPEC-EGOV-GET-RELATED-LAWS-014 候補の問い合わせで e-Gov からの取得に失敗したら、SOURCE_* のエラーを返し候補ごとの結果は返さない

`law_name` を法令に解決した後、候補を e-Gov に問い合わせている途中で取得に失敗したときは、次のエラーを返す。応答はエラーだけで、`related`・`not_found`・`law` は返さない。

| 失敗                                   | `code`                | `retryable` |
| -------------------------------------- | --------------------- | ----------- |
| タイムアウト                           | `SOURCE_TIMEOUT`      | `true`      |
| HTTP 429                               | `SOURCE_RATE_LIMITED` | `true`      |
| HTTP 5xx                               | `SOURCE_API_ERROR`    | `true`      |
| 5xx 以外の HTTP エラー（例: 400）      | `SOURCE_API_ERROR`    | `false`     |

例: 略称辞書で解決する `law_name: "所得税法"` で、候補 `所得税法施行令` の問い合わせが HTTP 429 を返すと `{ code: "SOURCE_RATE_LIMITED", retryable: true, … }`。タイムアウトなら `code: "SOURCE_TIMEOUT"`、HTTP 503 なら `code: "SOURCE_API_ERROR"`、HTTP 400 なら `code: "SOURCE_API_ERROR"` で `retryable: false`。

### SPEC-EGOV-GET-RELATED-LAWS-015 LAW_NOT_FOUND に hint と、resolve_abbreviation・search_law の next_actions を付ける

SPEC-EGOV-GET-RELATED-LAWS-006 の `LAW_NOT_FOUND` は、`hint: "略称辞書 / e-Gov 法令検索で該当なし。表記を確認してください"` と、次の 2 件の `next_actions` をこの順で持つ。

1. `action: "resolve_abbreviation"`、`example: { abbr: <渡した law_name> }`
2. `action: "search_law"`、`example: { keyword: <渡した law_name> }`

例: `law_name: "存在しない法"` は `{ code: "LAW_NOT_FOUND", error: "法令が見つかりません: 存在しない法", hint: "略称辞書 / e-Gov 法令検索で該当なし。表記を確認してください", next_actions: [{ action: "resolve_abbreviation", example: { abbr: "存在しない法" }, … }, { action: "search_law", example: { keyword: "存在しない法" }, … }] }`。
