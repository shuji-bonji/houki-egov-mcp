# 変更: 検索の件数・0 件の案内・通称の展開・管轄外の略称、法令種別の解説、附則の別表の図の置き場所（段階 5 検索と解説と添付）

- 対象: `search_law` / `search_fulltext` / `explain_law_type` / `list_attachments` の `specs/current/<tool>/spec.md`
- 実装の変更: 要（下の「実装の変更」）
- 承認日: 2026-10-03（PR #96）
- 状態: 草案
- 起こした日: 2026-10-03（JST）
- 起こした役: Spec Steward
- 対象 Issue: houki-egov-mcp #55（`search_law` の `domain`・`total_count`・0 件のとき）、#67（`search_fulltext` の通称の展開と 2 文字の語の例）、#88（`search_fulltext` に管轄外の略称）、#62（`explain_law_type` の「通知」と法令種別コード）、#72（附則の別表・様式の図の `location`）
- 決定の出典: houki-hub `docs/DECISIONS.md` 2026-09-29「T4 応答の形」「houki-egov-mcp の段階 5 は 0.18.0 → 0.19.0」、`docs/notes/2026-09-29-plan-spec-issues.md` 4 章「段階 5」の表・5.1・5.4、7 章（#88 を 0.18.0 に追加、2026-10-03）
- 前提: 差分 `20261003-law-resolution`（`spec/20261003-law-resolution`。#45・#51・#63・#87）の上に積む。`list_attachments` の spec.md を両方が触る（あちらは 018 の MODIFIED と 024 の ADDED、こちらは 002 の MODIFIED と 025 の ADDED）ため。マージも law-resolution → この差分の順。ほかの 3 つの spec.md（`search_law`・`search_fulltext`・`explain_law_type`）はあちらの差分が触らない

## なぜ変えるか

5 件はどれも、応答が「実際にしたこと」と違って読める問題である。

- `search_law` は、説明に「分野タグで絞り込み」とある `domain` で絞らず、`total_count` は返した件数で、0 件のときに次の手を返さない（#55）
- `search_fulltext` は、通称（`インボイス` など）を常に正式名称にも展開するので、本文に正式名称（`消費税法`）を書いた他の条まで当たる。2 文字の語だけのときの例は、語によらず `民法 <語>` を添える（#67）
- `search_fulltext` に管轄外の略称（`消基通`）を渡すと成功（0 件）で返り、応答の外側では管轄外だと分からない。ほかの 11 ツールは外側で `OUT_OF_SCOPE`（#88）
- `explain_law_type` は、`通知` を独立の種別として返すのに `通達` の別名にも `通知` を載せている。e-Gov が返す法令種別コード `Constitution`・`Rule` を解決しない（#62）
- `list_attachments` は、附則の別表・様式の中の図の置き場所を附則全体にし、見出しを付けない（#72）

## 確かめた値（2026-10-03 JST）

| 呼び出し                                                                                                                          | 結果                                                                                                                                                                                                   | 使った仕様 ID        |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| `/laws?law_title=保険&limit=10`（10:20、e-Gov 法令 API v2）                                                                       | `total_count: 278`、`count: 10`                                                                                                                                                                        | SEARCH-LAW-006       |
| houki-egov-dev 0.17.0 `search_law { keyword: "保険", limit: 2 }`（10:20）                                                         | `total_count: 2`。`results[1].law_type` は `ImperialOrder`（健康保険法施行令。下の「この差分の外で見つけたこと」1）                                                                                    | 006                  |
| houki-egov-dev 0.17.0 `search_fulltext { keyword: "インボイス", limit: 5 }`（10:16。手元の DB は `last_sync_date: "2026-09-19"`） | 1 件目は本文に「インボイス」がある国外送金等調書法施行規則 第2条、2〜5 件目は本文に「消費税法」とある消費税法の附則の条（`abbrev_match`）。`expanded_keywords: { from: "インボイス", to: "消費税法" }` | SEARCH-FULLTEXT-007  |
| houki-egov-dev 0.17.0 `search_fulltext { keyword: "控除", limit: 5 }`（10:16）                                                    | `short_tokens.next_actions[0].example` は `{ keyword: "民法 控除" }`。`law_meta` の 2 件は題名に「控除」を含む政令で、語から法令を選ぶ案では関係の薄い法令になる                                       | 018                  |
| houki-egov-dev 0.17.0 `search_fulltext { keyword: "消基通", limit: 3 }`（10:16）                                                  | `source: "bulk"`・`count: 0`・`hits: []` の成功。`isError` なし                                                                                                                                        | 037                  |
| `/laws?law_type=<値>&limit=1`（10:18）                                                                                            | `Constitution` 1 件・`ImperialOrder` 74 件・`Rule` 453 件・`Misc` 0 件（いずれも 200）。`ImperialOrdinance` は 400・`400001`                                                                           | EXPLAIN-LAW-TYPE-022 |
| houki-egov-dev 0.17.0 `explain_law_type { name: "ImperialOrder" }`（10:19）                                                       | `found: false`                                                                                                                                                                                         | 022                  |
| e-Gov の国民年金法・厚生年金保険法・所得税法・地方税法の本文（10:15）                                                             | `SupplProvisionAppdxTable` と `SupplProvisionAppdxTableTitle` がある。その中に `Fig` は無い                                                                                                            | LIST-ATTACHMENTS-025 |

## 確かめていない点

- `インボイス` を元の語だけで探したときの件数（007）。手元の DB で展開を止めて引く方法が無かった
- 附則の様式（`SupplProvisionAppdxStyle`・`SupplProvisionAppdxStyleTitle`）と附則の付録（`SupplProvisionAppdx`）の要素の実例と、附則の別表・様式の中に図がある実際の法令（025）。#72 の時点からの「まだ確かめていない」が残る
- `search_law` の 0 件のときの `hint`・`next_actions` が、`search_fulltext` の DB が無いときの `fallback`（SPEC-EGOV-SEARCH-FULLTEXT-028）の中にも入ること（入る前提で「互換性」に書いた）

## Issue ごとの変更

### #55 `search_law` の `domain`・`total_count`・0 件

**今の動き（v0.17.0）**: `domain` は受け付けるが使わない（`keyword: "労働基準", domain: "tax", law_type: "Act"` で労働基準法が返る）。`total_count` は `results` の件数。0 件のときは `total_count: 0`・`results: []` だけ。`search_fulltext` の `domain` の説明と `filters.domain.note` は「v0.5.0 では未実効」のまま。

**変えた後の動き**: `domain` を `search_law` と `search_fulltext` の両方の inputSchema から外す（渡すと `INVALID_ARGUMENT`）。`search_fulltext` の `filters.domain` はキーを残し、`requested: null`・`applied: false` と、外したことを書いた `note` を返す（T4: フィールドを消さない）。`total_count` は e-Gov の `total_count`（`limit` で切る前の総数）にし、名前は変えない。0 件のときは `hint` と、`search_fulltext`・`resolve_abbreviation`（`law_type` を渡したときは先に `law_type` を外した `search_law`）の `next_actions` を付ける。1 件以上のときは `hint: null`・`next_actions: []`（T4）。

| 種類     | 仕様 ID                                                 |
| -------- | ------------------------------------------------------- |
| ADDED    | SPEC-EGOV-SEARCH-LAW-016・017                           |
| MODIFIED | SPEC-EGOV-SEARCH-LAW-006、SPEC-EGOV-SEARCH-FULLTEXT-022 |

| 決めること                                       | 答え                                                                                                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `domain` を実装するか、知らせるか、外すか        | 外す（両ツール）。実装するには分野の分類が要るが、分野の値は略称辞書（約 170 件のエントリ）にしか無く、e-Gov の約 9,500 件の法令を分けられない。`search_fulltext` の説明の版番号の誤り（v0.5.0）は、引数を外すので一緒に消える |
| `total_count` を総数にするか、名前・説明を直すか | 総数にする（e-Gov の `total_count`）。名前は変えない（T4）                                                                                                                                                                     |
| 0 件のときに `hint` と `next_actions` を付けるか | 付ける（017）                                                                                                                                                                                                                  |

### #67 `search_fulltext` の通称の展開と 2 文字の語の例

**今の動き（v0.17.0）**: 略称・通称のどちらも、常に元の語と正式名称で探す（OR）。2 文字の語だけのときの 1 件目の例は `民法 <語>`。

**変えた後の動き**: 略称（`労基法`・`消法`）は今までどおり常に展開する。通称（`インボイス`・`適格請求書`）は、元の語で条のヒットが 0 件のときだけ正式名称で探し直す（houki-nta-mcp #21 と同じ規則）。2 文字の語だけのときの 1 件目の案内は、`example` を付けず、`reason` に「<法令名> <語>」の形を書く。

| 種類     | 仕様 ID                            |
| -------- | ---------------------------------- |
| MODIFIED | SPEC-EGOV-SEARCH-FULLTEXT-007・018 |

| 決めること                                                                 | 答え                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 通称の展開を法令名の照合だけに使うか、本文にも使うか（nta と揃えるか）     | nta と揃える。本文の検索にも使うが、元の語で条が当たらないときだけ                                                                                                                                                                                 |
| 2 文字の語の例に、固定の法令名・語から選ぶ・法令名を空けた形のどれを出すか | 法令名を空けた形。ただし `example` に `<法令名>` のような置き換え前提の文字列を入れると、そのまま渡したときに 0 件になるので、`example` は付けず `reason` に形を書く。語から選ぶ案は、`控除` の `law_meta` が関係の薄い政令 2 件だったので採らない |

### #88 `search_fulltext` に管轄外の略称

**今の動き（v0.17.0）**: DB があると `source: "bulk"` の 0 件の成功、DB が無いと `source: "api-fallback"` の成功で、`fallback` の中に `OUT_OF_SCOPE`。

**変えた後の動き**: `keyword` 全体が管轄外の略称なら、DB の有無によらず、DB も e-Gov も引かずに外側で `OUT_OF_SCOPE`（`search_law` の SPEC-EGOV-SEARCH-LAW-015 と同じ本文）。管轄外の略称が `keyword` の一部に含まれるだけのときは今のまま本文を探す。

| 種類  | 仕様 ID                       |
| ----- | ----------------------------- |
| ADDED | SPEC-EGOV-SEARCH-FULLTEXT-037 |

| 決めること                                                            | 答え                                                                                                                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. `keyword` 全体が管轄外の略称のとき、外側で `OUT_OF_SCOPE` を返すか | 返す（案 A）                                                                                                                                  |
| 2. 管轄外の略称と別の語の組み合わせのとき                             | 今のまま本文を探す。`消基通 仕入税額控除` の「仕入税額控除」は法令の本文にもある語で、`OUT_OF_SCOPE` にすると法令側の条を探す道がなくなるため |
| 3. 案 A のとき、DB があるときの本文の検索をやめてよいか               | やめる。`消基通` で本文を探した結果は 0 件だった（2026-10-03）。通達の略称が e-Gov の法令の本文に出てくる条は、出てきても通達の本文ではない   |

### #62 `explain_law_type` の「通知」と法令種別コード

**計画書 5.4 の「動きを変えない決定」で閉じられるかの判断**: 閉じられない。「通知」の部分は今の動き（名前の一致を別名より先に確かめるので、`通知` は `通知` の解説を返す）を意図として書けば閉じられるが、法令種別コードの部分（`Constitution`・`Rule` が `found: false`）は、`get_law` などが返す `law_type` を渡しても解説が返らないので、動きを変えないと閉じられない。

**今の動き（v0.17.0）**: `通知` は独立の種別の解説を返すが、`通達` の `info.aliases` にも `通知` がある。コードで引けるのは `Act`・`CabinetOrder`・`MinisterialOrdinance` だけ。

**変えた後の動き**: `通知` は独立の種別のまま（動きは変えない）とし、`通達` の別名から `通知` を外す（`通達` の `info.aliases` の値だけが変わる）。`Constitution` → 憲法、`Rule` → 規則を解決する。`ImperialOrder`（勅令）は収録している種別に無いので `found: false` のまま。

| 種類     | 仕様 ID                                                                          |
| -------- | -------------------------------------------------------------------------------- |
| ADDED    | SPEC-EGOV-EXPLAIN-LAW-TYPE-021・022                                              |
| MODIFIED | SPEC-EGOV-EXPLAIN-LAW-TYPE-012（憲法・規則の `law_type_code`、通達の `aliases`） |

| 決めること                                                                                   | 答え                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `通知` を独立の種別にするか、`通達` の別名にするか                                           | 独立の種別（021）。解説の中身が違い（`通知` は個別の事案の連絡、`通達` は解釈の指針）、今の応答もそうなっている                                                             |
| `Rule`・`ImperialOrdinance`・`Constitution`（と e-Gov が返す他のコード）を解説に結び付けるか | `Constitution`・`Rule` は結び付ける（022）。e-Gov の値は `ImperialOrdinance` ではなく `ImperialOrder` で、勅令の解説は今の表に無いので結び付けない（「人が判断すること」4） |

### #72 附則の別表・様式の図の `location`

**今の動き（v0.17.0）**: 図の置き場所を決める処理は、本則の `AppdxTable`・`AppdxStyle`・`AppdxFormat`・`AppdxFig`・`Appdx` しか知らない。附則の `SupplProvisionAppdxTable` などの中の図は `{ tag: "SupplProvision", amend_law_num }` になる。

**変えた後の動き**: 附則の別表・様式・付録を、本則と同じく置き場所として扱い、`tag` は e-Gov の要素名（`SupplProvisionAppdxTable` など）、`title` は見出し、`related_article` は関係条文、`amend_law_num` は附則の改正法番号にする。

| 種類     | 仕様 ID                                                      |
| -------- | ------------------------------------------------------------ |
| ADDED    | SPEC-EGOV-LIST-ATTACHMENTS-025                               |
| MODIFIED | SPEC-EGOV-LIST-ATTACHMENTS-002（附則の別表・様式の行を足す） |

| 決めること                                                           | 答え                                                                                                                                                                                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 附則の別表・様式を置き場所として扱い、見出しを付けるか（`tag` の値） | 扱う。`tag` は本則（SPEC-EGOV-LIST-ATTACHMENTS-012 の `AppdxTable` など）と同じく e-Gov の要素名にし、`amend_law_num` で附則を区別する。`tag: "AppdxTable"` に揃えて `amend_law_num` だけで区別する案は「人が判断すること」5 |

## 変わらない振る舞い

- `search_law` の略称の置き換え、`law_type` の絞り込み、`limit` の範囲、エラーの code
- `search_fulltext` の略称（通称でないもの）の展開、2 文字の語の扱い（`not_searched`・`scan_body`）、`filters.law_type`、DB が無いときの切り替え（`keyword` 全体が管轄外の略称のときを除く）
- `explain_law_type` の `通知` の解説の中身、`name: "通知"` の応答、ほかの種別の `info`
- `list_attachments` の本則の別表・様式・条・附則の条の中の図の `location`
- 応答のフィールドを消す・名前を付け替える変更は無い（T4）。消すのは引数 `domain`（応答のフィールドではない）

## 実装 PR で直す文書

動きを変えない行で、仕様 ID を作らないもの（T5 の決め方）。

| #   | 場所                                                                 | 直すこと                                                                                                                                                 |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | tools/list の `search_law` の `description`                          | 「分野で」を消す（`domain` を外すため）。`total_count` が一致した総数であることを書く                                                                    |
| 2   | tools/list の `search_fulltext` の `description` と `keyword` の説明 | 「略称は正式名称に OR 展開」を「略称は正式名称にも展開、通称は元の語で条が当たらないときだけ正式名称で探す」にする。管轄外の略称は `OUT_OF_SCOPE` を書く |
| 3   | tools/list の `explain_law_type` の `name` の説明                    | コードの例に `"Constitution"`・`"Rule"` を足す                                                                                                           |
| 4   | README の `search_law` / `search_fulltext` の引数の表                | `domain` の行を消す                                                                                                                                      |

## 互換性（0.18.0 の CHANGELOG の「互換性」の節に書くもの）

| 場面                                                                   | 0.17.0                                                             | 0.18.0                                                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `search_law` / `search_fulltext` に `domain` を渡す                    | 受け付けて無視（成功）                                             | `INVALID_ARGUMENT`（`path: "domain"`）。引数を外すので、渡している呼び出しは失敗する                               |
| `search_law` の `total_count`                                          | `results` の件数                                                   | e-Gov で一致した総数（`limit` を超えうる）                                                                         |
| `search_law` の応答                                                    | `query`・`total_count`・`results`                                  | `hint`（1 件以上は `null`）・`next_actions`（1 件以上は `[]`）を足す。`search_fulltext` の `fallback` の中にも入る |
| `search_fulltext` の `filters.domain.note`                             | `domain 絞り込みは v0.5.0 では未実効です (…)`                      | `分野での絞り込みはしていません（domain の引数は 0.18.0 で外しました）`                                            |
| `search_fulltext` の通称（`インボイス` など）                          | 常に正式名称にも展開                                               | 元の語で条が 0 件のときだけ展開。件数・並びが変わる                                                                |
| `search_fulltext` の 2 文字の語の `short_tokens.next_actions[0]`       | `example: { keyword: "民法 <語>" }`                                | `example` 無し。`reason` に形を書く                                                                                |
| `search_fulltext` に `keyword` 全体が管轄外の略称                      | 成功（DB があれば 0 件、無ければ `fallback.code: "OUT_OF_SCOPE"`） | `OUT_OF_SCOPE`（`isError`）                                                                                        |
| `explain_law_type` の `通達` の `info.aliases`                         | `["通知", "基本通達", "取扱通達"]`                                 | `["基本通達", "取扱通達"]`                                                                                         |
| `explain_law_type` の `Constitution`・`Rule`                           | `found: false`                                                     | `found: true`（憲法・規則）。`憲法` の `info.law_type_code: "Constitution"`、`規則` は `"Rule"`                    |
| `list_attachments` / `get_attachment` の附則の別表・様式・付録の中の図 | `{ tag: "SupplProvision", amend_law_num }`                         | `{ tag: "SupplProvisionAppdxTable" など, title, related_article, amend_law_num }`                                  |

houki-research-skill で直すもの: `skills/houki-research/workflows/feasibility-check.md` 86 行目の `search_law { "keyword": "<語>", "domain": "tax" }`（`domain` を外す。2026-10-03 JST に grep で見つけた）。`docs/ERROR-CODES.md` の `OUT_OF_SCOPE` を返すツールに `search_fulltext` を足す。

## 呼び出し例への影響

2026-10-03 JST に houki-hub `scripts/reference-examples/houki-egov/ja/*.md` と houki-research-skill の `skills/houki-research/` を grep した。

- `domain` を渡す例: Skill の `feasibility-check.md` 86 行目だけ（上の「互換性」）。hub の `search_fulltext.md` 50 行目は応答の `filters.domain` で、段階 6 の取り直しで `note` の文が変わる
- hub の `search_law.md`・`search_fulltext.md` は、段階 6 の取り直しで `total_count`・`hint`・`next_actions`・`expanded_keywords` が変わりうる
- `explain_law_type` の例に `通達` の `aliases` を載せていれば、`通知` が消える

## 実装の変更

- `search_law` / `search_fulltext` の inputSchema から `domain` を消す。`search_fulltext` の `filters.domain` の `note` を差し替える
- `search_law` の `total_count` に e-Gov の応答の `total_count` を入れる。0 件のときに `hint`・`next_actions` を組み立て、1 件以上は `null`・`[]` を入れる
- `search_fulltext` の展開: 略称と通称を見分け（houki-abbreviations のエントリのどこで当たったか）、通称は元の語の条のヒットが 0 件のときだけ正式名称で引き直す
- `search_fulltext` の 2 文字の語の 1 件目の案内から `example` を外し、`reason` を差し替える
- `search_fulltext` の入口で、`keyword` 全体が管轄外の略称なら `checkAbbreviationScope()` の `OUT_OF_SCOPE` を返す（DB を開く前）
- `explain_law_type` の表: `憲法` に `law_type_code: "Constitution"`、`規則` に `law_type_code: "Rule"` を足し、`通達` の `aliases` から `通知` を外す。`LawTypeCode` の型に `Constitution`・`Rule` を足す
- 図の置き場所を決める処理に、`SupplProvisionAppdxTable` / `SupplProvisionAppdxStyle` / `SupplProvisionAppdx` と見出しの要素名を足す

## 取り込みのとき（Publisher）

- 差分 `20261003-law-resolution` を先に取り込む（`list_attachments` の 018・024 があちら）
- ADDED の見出しを、各 `specs/current/<dir>/spec.md` の「できること」の末尾に足す。MODIFIED は見出しの行（題）も含めて、差分の見出しと本文に置き換える
- 各差分の spec.md の冒頭に書いた、ID の無い節の変更（「入力」の表、「処理の流れ」の図、「できないこと」、SPEC-EGOV-EXPLAIN-LAW-TYPE-017 の末尾の 1 行、「未決」の行の削除）を行う
- 「未決」から次の行を消す: search_law 1・3・10、search_fulltext 2・3・4、explain_law_type 1・2
- 各 `specs/current/<dir>/spec.md` の承認日の行に「差分 `20261003-search-explain-attachment` は YYYY-MM-DD（PR #N）」を足す
- この差分のフォルダーを `specs/releases/<実装を出したタグ>/20261003-search-explain-attachment/` へ移し、この proposal.md の「状態」を取り込み済みにする
- CHANGELOG の 0.18.0 に閉じる Issue（#55・#67・#88・#62・#72）を列挙する。`Closes` は実装 PR の本文に書く

## 人が判断すること

1. **（#55）`domain` を外すこと。** 両ツールから外す側で書いた。代わりの案は、(B) 受け付けたまま `search_law` にも `filters.domain`（`applied: false`）を足して知らせる、(C) 略称辞書の `domain` で結果を選別する（辞書に載る法令だけが残るので、絞り込みではなく別の検索になる）。外すと、`domain` を渡している呼び出しが `INVALID_ARGUMENT` になる（Skill の 1 か所）。
2. **（#55）`search_law` の成功の応答に常に `hint: null`・`next_actions: []` を置くこと。** T4（値が無ければ `null`、キーを消さない）に合わせた。0 件のときだけキーを足す案もあるが、T4 に反する。
3. **（#67）通称の展開を nta #21 と同じにすること。** 同じ側で書いた。2 文字の通称（辞書に別名が 2 文字のものがあれば）は元の語が索引に載らないので、元の語で条が 0 件になりやすく、ほぼ常に展開する。
4. **（#62）`ImperialOrder`（勅令）を解説に結び付けないこと。** 勅令の解説（旧憲法下の天皇の命令で、今も効力が残るものがあること）を表に足すと、内容の確かめが要るので、この差分では `found: false` のままにした。足すなら新しい種別の行と `law_type_code: "ImperialOrder"` を足す別の差分にする。
5. **（#72）`tag` を e-Gov の要素名（`SupplProvisionAppdxTable`）にすること。** 本則の `AppdxTable` と同じ規則（要素名をそのまま）にした。`tag: "AppdxTable"` に揃えて `amend_law_num` の有無で附則を区別する案は、`tag` だけを見る利用者が本則の別表と混同するので採らなかった。
6. **（#88）一部に管轄外の略称を含む `keyword` を今のままにすること。** 2 の答えのとおり。`hint` で houki-nta-mcp を案内する案もある（成功の応答に `hint` を足すことになる）。
7. **承認日。** この proposal.md に承認日と PR 番号を書く。

## この差分の外で見つけたこと（Issue の候補）

1. **`search_law` / `search_fulltext` の `law_type` の enum の `ImperialOrdinance` を e-Gov が受け付けない。** e-Gov の値は `ImperialOrder`（`/laws?law_type=ImperialOrdinance` は 400・`400001`）。houki-egov-dev 0.17.0 で `search_law { keyword: "健康保険法", law_type: "ImperialOrdinance" }` を呼ぶと `SOURCE_API_ERROR`（`retryable: false`）になった（2026-10-03 10:19 JST）。応答の `results[].law_type` には `ImperialOrder` が入る。取り込み（`src/services/bulk/ingester.ts`）も `勅令: 'ImperialOrder'` を使っている。enum を `ImperialOrder` に直すか、両方を受けて e-Gov には `ImperialOrder` を渡すかを決める必要がある
2. **`get_article_references` で、条番号の付かない他法令の参照の `next_actions` が、呼んだ条の番号を参照先の法令の条として案内する。** `{ law_name: "所得税法施行規則", article: "3" }` の参照 `日本国との平和条約に基づき日本の国籍を離脱した者等の出入国管理に関する特例法（平成三年法律第七十一号）`（`article` 無し）から、`{ action: "get_law", example: { law_name: "日本国との平和条約…特例法", article: "3" } }` が作られた（2026-10-03 10:14 JST、houki-egov-dev 0.17.0）。SPEC-EGOV-GET-ARTICLE-REFERENCES-015 の「条を持たない internal は、指定した条」の規則が external にも当たっている
