---
approved: 2026-10-03
pr: 95
implementation: required
targets: [common_errors, get_article_references, get_attachment, get_law, get_law_file, get_law_range, get_law_revisions, get_related_laws, get_toc, list_attachments, verify_citations]
---
# 変更: 法令名・条・委任先を、確かなときだけ 1 つに決める（段階 5 法令の引き当て）

- 対象: `specs/current/common_errors/spec.md` と、`get_law` / `get_toc` / `get_law_range` / `get_law_revisions` / `get_related_laws` / `get_article_references` / `verify_citations` / `list_attachments` / `get_attachment` / `get_law_file` の `specs/current/<tool>/spec.md`
- 実装の変更の補足: 下の「実装の変更」
- 状態: 取り込み済み（v0.18.0）
- 起こした日: 2026-10-03（JST）
- 起こした役: Spec Steward
- 対象 Issue: houki-egov-mcp #45（完全一致しないとき 1 件目の法令を使う）、#51（本則と附則を区別しない）、#63（名前の形から関係法令・委任先を推定する）、#87（law_id が決まった後の e-Gov の 400・404 の code。#47 から移した 3 点を含む）
- 決定の出典: houki-hub `docs/DECISIONS.md` 2026-09-29「T2 code」「T4 応答の形」「houki-egov-mcp の段階 5 は 0.18.0 → 0.19.0」、`docs/notes/2026-09-29-plan-spec-issues.md` 4 章「段階 5」の表と 5.1・8 章、#87 のコメント（2026-10-03 JST）
- 前提: main `b5a138a`（0.17.0）の上に切る。同じ版（0.18.0）に入れる検索・解説・添付の差分（`spec/20261003-search-explain-attachment`。#55・#67・#88・#62・#72）は、`list_attachments` の spec.md を両方が触るので、この差分の上に積む。マージもこの順

## なぜ変えるか

#45・#51・#63 は、どれも「違う法令・条文を、違うことを知らせずに根拠として返す」害で、57 件の中で最も大きい（計画書 2.2）。#87 は、e-Gov が「その法令は無い」「その時点は受け付けない」と答えているのに、ツールによって `SOURCE_API_ERROR`（通信の失敗の code）になったり `LAW_NOT_FOUND`（法令が無い）になったりする。どちらも、利用者（LLM）が応答の外側（`isError`・`code`）だけを見て次の手を決めると、誤った根拠や誤った言い換えにつながる。

この差分は 4 つの Issue を、次の 1 つの考え方で揃える。

- 法令・条・委任先は、名前・番号が完全に一致したときだけ 1 つに決める。決まらなければ決めずに、候補か `null` を返す
- e-Gov の応答本文の `code`（`404004` など）で「無い」と分かったときは `*_NOT_FOUND`、時点の誤りと分かったときは `INVALID_ARGUMENT`。それ以外の 4xx は今までどおり `SOURCE_API_ERROR`（T2）

## 確かめた値（2026-10-03 JST）

e-Gov 法令 API v2 は Mac の VM から `curl` で、houki-egov-mcp 0.17.0 は houki-egov-dev（手元のビルド、main `b5a138a`）の MCP ツールで呼んだ。

| 呼び出し                                                                                                                                       | 結果                                                                                                                                                                                                                                                                            | 使った仕様 ID                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `/laws?law_title=保険法&limit=1000`（10:10）                                                                                                   | `total_count: 114`。完全一致の `保険法`（`420AC0000000056`、平成二十年法律第五十六号）は 78 件目。`limit=1000` も受け付け、114 件を 1 回で返した                                                                                                                                | COMMON-ERRORS-032、VERIFY-CITATIONS-045                                 |
| `/laws?law_title=会社法&limit=50`                                                                                                              | `total_count: 35`、完全一致は 22 件目（会社法は辞書に law_id があるので今は困らない）                                                                                                                                                                                           | 032 の説明                                                              |
| `/laws?law_title=所得税法&limit=50`                                                                                                            | `total_count: 20`、完全一致は 6 件目（同上。辞書に無ければ v0.17.0 の上位 5 件では外れる）                                                                                                                                                                                      | 032 の説明                                                              |
| `/laws?law_title=所得税法施行&limit=5`                                                                                                         | `total_count: 2`（所得税法施行令・所得税法施行規則）                                                                                                                                                                                                                            | GET-LAW-041 ほか                                                        |
| houki-egov-dev `get_law { law_name: "所得税法施行", article: "1", format: "json" }`（10:10）                                                   | 所得税法施行令 第1条を `meta.title: "所得税法施行令"` で返した。違う法令であることは `meta.title` にしか出ない                                                                                                                                                                  | GET-LAW-041                                                             |
| houki-egov-dev `get_toc { law_name: "保険法", depth: 1, suppl: "none" }`（10:10）                                                              | `meta.title: "健康保険法"`・`meta.law_id: "211AC0000000070"` の目次を返した                                                                                                                                                                                                     | GET-TOC-028                                                             |
| houki-egov-dev `verify_citations` の `保険法` 第1条（10:10）                                                                                   | `ambiguous`、`reason: "…部分一致が 50 件ありました"`（実際は 114 件）、`candidates` の先頭は健康保険法                                                                                                                                                                          | VERIFY-CITATIONS-045                                                    |
| houki-egov-dev `get_related_laws { law_name: "所得税法施行" }`（10:10）                                                                        | 所得税法施行令を起点に、所得税法と所得税法施行規則を `related` に返した                                                                                                                                                                                                         | GET-RELATED-LAWS-019                                                    |
| `/laws?law_title=行政手続等における情報通信の技術の利用に関する法律`（`asof` なし / `asof=2018-01-01`）                                        | どちらも `total_count: 24`。`asof` なしの 1 件目の題名は今の題名「情報通信技術を活用した行政の推進等に関する法律」、`asof=2018-01-01` では旧題名。旧題名で引いても今の題名が返るので、`at` を検索に付けないと完全一致しない                                                     | COMMON-ERRORS-032 の 2                                                  |
| e-Gov の消費税法 `363AC0000000108` の本文（10:11）                                                                                             | 本則の条は 85 件で第100条は無い。附則は 168 本で、附則(27)（平成八年六月一四日法律第八二号、抄）と附則(168)（令和八年三月三一日法律第一二号）に第100条がある                                                                                                                    | GET-LAW-042・043、VERIFY-CITATIONS-046・047、GET-ARTICLE-REFERENCES-046 |
| houki-egov-dev `get_law { law_name: "消費税法", article: "100" }`・`verify_citations` 同じ条（10:11）                                          | `get_law` は附則(27)の第100条を `# 消費税法 第100条` で返し、`verify_citations` は `article.label: "第100条"` の `found`                                                                                                                                                        | 同上                                                                    |
| `/law_data/999AC0000000999`、`/law_data/503AC0000000035?asof=2018-01-01`（10:12）                                                              | どちらも 404・`{"code":"404004","message":"指定のパラメータで取得できる法令本文ファイルは存在しません。"}`                                                                                                                                                                      | COMMON-ERRORS-033                                                       |
| `/law_data/340AC0000000033?asof=2000-01-01`、`/law_data/363AC0000000108?asof=1980-01-01`、`/law_data/418AC0000000108?asof=2007-10-01`（10:12） | どれも 400・`{"code":"400044","message":"法令の時点（asof）には2017-04-01以降を指定してください。"}`。法令が 2017-04-01 より前からあっても同じ                                                                                                                                  | 033                                                                     |
| `/law_data/363AC0000000108?asof=2026-02-30`                                                                                                    | 400・`400004`（`日付（asof等）が誤っています。`）。T1 で inputSchema とツールの処理が先に止めるので、e-Gov まで届かない                                                                                                                                                         | 033 の表に入れない理由                                                  |
| `/law_revisions/999AC0000000999`（10:12）                                                                                                      | 404・`{"code":"404001","message":"取得結果が０件です。"}`                                                                                                                                                                                                                       | GET-LAW-REVISIONS-008                                                   |
| `/law_file/xml/363AC0000000108?asof=2000-01-01`・`/law_file/xml/503AC0000000035?asof=2018-01-01`（10:13）                                      | 400・`400044`、404・`404004`（`/law_data` と同じ）                                                                                                                                                                                                                              | GET-LAW-FILE-014                                                        |
| `/laws?law_title=デジタル社会形成基本法&asof=2000-01-01`                                                                                       | 400・`400044`（法令名の検索も `asof` の下限を同じに扱う）                                                                                                                                                                                                                       | COMMON-ERRORS-029 の但し書き                                            |
| houki-egov-dev `get_law { law_name: "所得税法", article: "9", at: "2000-01-01" }`（10:12）                                                     | `SOURCE_API_ERROR`・`retryable: false`・`error: "e-Gov API error: e-Gov API returned 400"`                                                                                                                                                                                      | GET-LAW-031                                                             |
| houki-egov-dev `verify_citations { citations: [{ law_name: "所得税法", article: "9" }], at: "2000-01-01" }`（10:12）                           | その件が `LAW_NOT_FOUND`・`reason: "e-Gov に law_id 340AC0000000033 の法令がありません"`                                                                                                                                                                                        | VERIFY-CITATIONS-048                                                    |
| houki-egov-dev `get_related_laws { law_name: "国税関係法令に係る情報通信技術を活用した行政の推進等に関する省令" }`（10:13）                    | `law_id: "415M60000040071"`。`…省令施行令`・`…省令施行規則` を問い合わせて `not_found` に入れた                                                                                                                                                                                 | GET-RELATED-LAWS-020                                                    |
| houki-egov-dev `get_article_references { law_name: "道路交通法", article: "2" }`（10:13）                                                      | `内閣府令で定める`（9）・`環境省令で定める`（1）・`国土交通省令で定める`（1）の 3 件とも `target_law` が道路交通法施行規則（`335M50000002060`、法令番号 `昭和三十五年総理府令第六十号`）。本文の後 2 つは「内閣府令・環境省令で定める」「内閣府令・国土交通省令で定める」の連名 | GET-ARTICLE-REFERENCES-049                                              |
| houki-egov-dev `get_article_references { law_name: "労働基準法", article: "15" }`（10:13）                                                     | `厚生労働省令で定める` の `target_law` は労働基準法施行規則（`322M40000100023`、法令番号 `昭和二十二年厚生省令第二十三号`）                                                                                                                                                     | 049                                                                     |
| houki-egov-dev `get_article_references { law_name: "所得税法施行規則", article: "3" }`（10:14）                                                | 「令第二十四条第一号」が `law_name: "令"`・`resolved: false`                                                                                                                                                                                                                    | GET-ARTICLE-REFERENCES-048                                              |

## 確かめていない点

- 049 の省の表が、施行規則の法令番号に出る古い命令の名前を全部覆っているか（`内務省令`・`商工省令`・`逓信省令` など戦前の名前と、`環境庁` など庁の時代の総理府令は表に入れていない。入っていなければ `target_law: null` になるだけで、違う法令は指さない）
- 連名の省令の施行規則で、法令番号の命令の名前がどう書かれるか（`内閣府・総務省令` の形は確かめていない）
- 附則の中の条を `get_law` の `suppl_index` で引いたときの `markdown` の 2 行目（GET-LAW-043）を実データで組み立てた結果。文の形は `get_law_range` の `range.titles`（SPEC-EGOV-GET-LAW-RANGE-012）と同じにした
- e-Gov の `/laws` の `limit` の上限（1000 は受け付けた。`total_count` がそれを超える法令名があるかは確かめていない。超えるときは `offset` で取り直す前提で書いた）
- 本文の「附則第N条」の実例での `get_article_references` の応答（GET-ARTICLE-REFERENCES-047 の例は形だけ）

## Issue ごとの変更

### #45 完全一致しない法令名

**今の動き（v0.17.0）**: 略称辞書に law_id が無い `law_name` は、e-Gov の法令名検索（部分一致）を先頭 5 件だけ取り、題名の完全一致が無ければ 1 件目の法令を使う。違う法令の条文・目次・改正履歴・添付を、違うことを `meta.title` でしか知らせずに返す。`get_article_references` の法令番号の照合も、完全一致が無ければ 1 件目。`verify_citations` は完全一致だけを採るが、探すのは上位 50 件の中だけで、`reason` の件数も 50 で頭打ちになる。

**変えた後の動き**: 題名の完全一致だけを使い、検索結果の全件（`total_count`）から探す。完全一致が無く部分一致があれば、法令を取らずに `LAW_NOT_FOUND`（T2 の「問い合わせが成功して求めたものが無い」）を返し、候補の先頭 5 件を `hint` に、候補ごとの呼び直しの引数を `next_actions` に入れる。略称辞書で正式名称に直せたものは、その正式名称での完全一致として扱う（今までどおり）。`at` を受け取るツールで `at` を渡したときは、法令名の検索にも `asof=<at>` を付け、その時点の題名で照合する（#87 から移した点 2。下の「人が判断すること」3）。

| 種類     | 仕様 ID                                                                                                                                                                                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADDED    | SPEC-EGOV-COMMON-ERRORS-032、SPEC-EGOV-GET-LAW-041、SPEC-EGOV-GET-TOC-028、SPEC-EGOV-GET-LAW-RANGE-034、SPEC-EGOV-GET-LAW-REVISIONS-018、SPEC-EGOV-GET-RELATED-LAWS-019、SPEC-EGOV-GET-ARTICLE-REFERENCES-044・045、SPEC-EGOV-VERIFY-CITATIONS-045、SPEC-EGOV-LIST-ATTACHMENTS-024、SPEC-EGOV-GET-ATTACHMENT-030、SPEC-EGOV-GET-LAW-FILE-023 |
| MODIFIED | SPEC-EGOV-COMMON-ERRORS-029（`LAW_NOT_FOUND` を「0 件、または部分一致だけ」に）                                                                                                                                                                                                                                                              |

Issue の「決めること」への答え:

| 決めること                                                                                    | 答え                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 完全一致しないとき 6 ツールが何を返すか（A: エラーと候補 / B: 1 件目と印）                    | A。`list_attachments` / `get_attachment` / `get_law_file` も同じ決め方を使っているので、9 ツールに当てた |
| 法令番号の引き当て（`get_article_references`）も同じ規則にするか                              | する（045）。完全一致が無ければ `resolved: false`                                                        |
| `verify_citations` の上位 50 件の制限を変えるか。部分一致が 50 件を超える法令名が実際にあるか | 全件から探す（045）。`保険法` が 114 件で、完全一致は 78 件目にあった                                    |

### #51 本則と附則

**今の動き（v0.17.0）**: `get_law` と `verify_citations` は、条を法令本文の全体から探し、先に見つかった条を返す。本則に無い条番号でも、附則に同じ番号の条があればその条を本則の条と同じ形で返す（消費税法第100条で確かめた）。`get_article_references` は本文の「附則第三条」を本則の第3条への `internal` にし、本則の第3条を指す `get_law` を案内する。

**変えた後の動き**: 条は本則の中だけで探す。附則の条は `suppl_index`（`get_toc` の `suppl_provisions[].index`、`get_law_range` の `suppl_index` と同じ番号）で附則を指して取る。本則に無く附則に同じ番号の条があるときは `ARTICLE_NOT_FOUND` にし、その附則の番号と、`suppl_index` を足した呼び直しの引数を案内する。`get_article_references` は本則の条だけを対象にし、本文の「附則第N条」は `kind: "suppl"`・`resolved: false` で返す。

| 種類     | 仕様 ID                                                                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADDED    | SPEC-EGOV-GET-LAW-042・043、SPEC-EGOV-VERIFY-CITATIONS-046・047、SPEC-EGOV-GET-ARTICLE-REFERENCES-046・047                                                                        |
| MODIFIED | SPEC-EGOV-GET-LAW-008（本則から取り出す）、SPEC-EGOV-VERIFY-CITATIONS-005（`article.suppl_index` と附則の `label`）、SPEC-EGOV-COMMON-ERRORS-023（`suppl_index` の行を 2 つ足す） |

Issue の「決めること」への答え:

| 決めること                                            | 答え                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 条を探す範囲を本則に限るか、附則の条に印を付けるか    | 本則に限る（`get_law` 042、`verify_citations` 046）。印を付ける案は「人が判断すること」4 |
| 附則の条を指定する方法を `get_law` に設けるか         | 設ける。`suppl_index`（043。`verify_citations` は 047）                                  |
| 「附則第N条」を別の種類の参照にするか、参照から外すか | 別の種類 `kind: "suppl"` にする（047）。外すと本文に参照があることが分からなくなる       |

### #63 名前の形からの推定

**今の動き（v0.17.0）**: `get_related_laws` は、末尾が「施行令」「施行規則」でない政令・省令を法律と同じに扱い、実在しえない `…省令施行令` を候補にする。`get_article_references` は、施行規則の本文の「令第N条」を解決しない。「…省令で定める」は省の名前を問わず `<法律名>施行規則` に結び付け、所管の違う省令や連名の省令も施行規則を指す（道路交通法第2条で確かめた）。

**変えた後の動き**: 確かでないときは推定しない。

- `get_related_laws`: 法律（`law_type: "Act"`）でもなく、末尾が「施行令」「施行規則」でもない法令からは候補を作らず、`related: []`・`not_found: []` と、そのことを書いた `note` を返す（020）
- `get_article_references`: 委任の文言の命令の名前と、施行規則の法令番号の命令の名前が同じ（省の改称の表で同じ省に当たるものを含む）ときだけ `target_law` を付け、それ以外と `主務省令` は `target_law: null`（049。`null` は T4 の決まりで、キーを消さない。031 も `null` に揃える）。施行規則の本文の「令第N条」は、兄弟の施行令が実在すれば `external` に解決する（048）。施行規則の条からは、当たる見込みの低い呼び名 `規則` の `search_fulltext` を作らない（050。Issue のコメント 2026-09-27）

| 種類     | 仕様 ID                                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADDED    | SPEC-EGOV-GET-RELATED-LAWS-020、SPEC-EGOV-GET-ARTICLE-REFERENCES-048・049・050                                                                                                                     |
| MODIFIED | SPEC-EGOV-GET-RELATED-LAWS-004（法律でない法令の扱い）、SPEC-EGOV-GET-ARTICLE-REFERENCES-012（委任先は確かなときだけ）、SPEC-EGOV-GET-ARTICLE-REFERENCES-031（`target_law` のキーを消さず `null`） |

Issue の「決めること」への答え:

| 決めること                                                                   | 答え                                                                                                                          |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 法律でない法令からは候補を作らないか                                         | 作らない（020）                                                                                                               |
| 「令」「規則」を兄弟の施行令・施行規則に解決するか                           | 施行規則の本文の「令」だけ解決する（048）。施行令の本文の「規則」は、施行令が施行規則を引く書き方が一般的でないので解決しない |
| 省令の名前ごとに委任先を分けるか、確かでないときは `target_law` を付けないか | 両方。名前が合うときだけ付け、合わない・決まらないときは `null`（049）                                                        |

### #87 law_id が決まった後の 400・404

**今の動き（v0.17.0）**: law_id を決めた後に e-Gov が 404 を返すと、`get_law` などは `SOURCE_API_ERROR`（`retryable: false`）、`verify_citations` はその件を `LAW_NOT_FOUND` にする。e-Gov は `asof` が 2017-04-01 より前だと 400・`400044` を返すが、`get_law` などは理由を書かない `SOURCE_API_ERROR`、`verify_citations` は「e-Gov に law_id … の法令がありません」と書く（所得税法でも）。

**変えた後の動き**: e-Gov の応答本文の `code` で振り分ける（SPEC-EGOV-COMMON-ERRORS-033）。`404004`（`/law_data`・`/law_file`）と `404001`（`/law_revisions`）は `LAW_NOT_FOUND`、`400044` は `INVALID_ARGUMENT`（`path: "at"`、`hint` に e-Gov の `message`）、そのほかの 4xx は今までどおり `SOURCE_API_ERROR`。`verify_citations` は、404 は件ごとの `LAW_NOT_FOUND`、`400044` はツール全体の `INVALID_ARGUMENT`（`at` は全件に共通のため）、そのほかの 400 はツール全体の `SOURCE_API_ERROR`。

| 種類     | 仕様 ID                                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADDED    | SPEC-EGOV-COMMON-ERRORS-033、SPEC-EGOV-GET-TOC-029、SPEC-EGOV-GET-LAW-RANGE-035、SPEC-EGOV-GET-ARTICLE-REFERENCES-051、SPEC-EGOV-GET-ATTACHMENT-031、SPEC-EGOV-VERIFY-CITATIONS-048 |
| MODIFIED | SPEC-EGOV-COMMON-ERRORS-027、SPEC-EGOV-GET-LAW-031、SPEC-EGOV-GET-LAW-REVISIONS-008、SPEC-EGOV-LIST-ATTACHMENTS-018、SPEC-EGOV-GET-LAW-FILE-014、SPEC-EGOV-VERIFY-CITATIONS-015     |

Issue の「決めること」と #47 から移した 3 点への答え:

| 決めること                                                                                                                                       | 答え                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 400・404 を `LAW_NOT_FOUND` に揃えるか、`verify_citations` を `SOURCE_API_ERROR` に揃えるか                                                   | 404（`404004`・`404001`）は `LAW_NOT_FOUND` に揃える。T2 の「取得元の 404 は番号の誤り」と同じ                                                                                                        |
| 2. `LAW_NOT_FOUND` の `hint` で「law_id が古い / `at` の時点に無い」を言い分け、`next_actions` に `search_law` と `get_law_revisions` を入れるか | 入れる。`at` を渡したかどうかで `error`・`hint` を分け、`at` があれば `get_law_revisions` を先に置く（033）                                                                                           |
| 3. 400 を 404 と同じに扱うか                                                                                                                     | 扱わない。実データでは 400 は `400044`（時点の下限 2017-04-01）と `400004`（日付の形）で、どちらも「法令が無い」ではなかった。`400044` は `INVALID_ARGUMENT`、ほかの 400 は `SOURCE_API_ERROR` のまま |
| 4. どの版で入れるか                                                                                                                              | 0.18.0（この差分）                                                                                                                                                                                    |
| #47 から 1: その時点に法令がまだ無い `at`                                                                                                        | e-Gov は 404・`404004` を返す（デジタル社会形成基本法 `asof=2018-01-01` で確かめた）。`LAW_NOT_FOUND` にし、`at` の時点に無いことを `error` に書く                                                    |
| #47 から 2: `verify_citations` で `at` を法令名の検索に使うか                                                                                    | 使う。`verify_citations` だけでなく、`at` を受け取る全ツールで使う（032 の 2。改題した法令を旧題名で引けるため）                                                                                      |
| #47 から 3: `verify_citations` の未決 2「400 を law_id が無いと書く」                                                                            | 書かない。`400044` はツール全体の `INVALID_ARGUMENT`（048）、404 だけ件ごとの `LAW_NOT_FOUND`（015）                                                                                                  |

## 変わらない振る舞い

- 略称辞書に law_id がある名前（`消法`・`所得税法` など）の引き当て。e-Gov の法令名検索を引かない
- 法令名の検索が 0 件のときの `LAW_NOT_FOUND` の文（GET-LAW-026 ほか）と、検索が通信の失敗で終わったときの `SOURCE_*`（COMMON-ERRORS-029）
- `verify_citations` の部分一致の件は件ごとの `ambiguous` のまま（013・030）。ツール全体のエラーにしない
- 本則の条の取り出し方・Markdown の形・`meta` のフィールド
- `get_law_range` の `suppl_index` の数え方（`get_law` / `verify_citations` も同じ番号を使う）
- 「政令で定める」の委任先（施行令）と、委任先が自身のときの `self: true`
- 429・5xx・時間切れ・接続できないときの code と `retryable`（COMMON-ERRORS-027・028）
- 応答のフィールドを消す・名前を付け替える変更は無い。足すのは `data.suppl_index`（`get_law` の json）と `article.suppl_index`（`verify_citations`）で、値が無ければ `null`（T4）

## 実装 PR で直す文書

動きを変えない行で、仕様 ID を作らないもの（T5 の決め方）。

| #   | 場所                                                                        | 直すこと                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | tools/list の `get_law` の `description` と inputSchema の `article` の説明 | 「本則の条を探す。附則の条は `suppl_index` で附則を指す」を足す。`suppl_index` の説明を足す                                                                                                                                                                    |
| 2   | tools/list の `verify_citations` の `citations.items` の説明                | `suppl_index` を足す。`description` の「略称は略称辞書で正式名称に直してから照合する」の後に「法令名は完全一致だけを採る」を足す                                                                                                                               |
| 3   | tools/list の `get_article_references` の `description`                     | 「本則の条だけを対象にする」「附則第N条は `kind: "suppl"`」「省令の委任先は命令の名前が合うときだけ付ける」を足す。`coverage.note`（SPEC-EGOV-GET-ARTICLE-REFERENCES-020）の文に「委任先が確かでないときは `target_law: null`」を足すかは「人が判断すること」7 |
| 4   | tools/list の `get_related_laws` の `description`                           | 「法律でも施行令・施行規則でもない法令からは候補を作らない」を足す                                                                                                                                                                                             |
| 5   | README の「エラー」の表                                                     | `LAW_NOT_FOUND` に「完全一致が無いときは候補を返す」「law_id を決めた後に e-Gov が 404 を返したとき」、`INVALID_ARGUMENT` に「e-Gov が時点を受け付けないとき（2017-04-01 より前）」を足す                                                                      |

## 互換性（0.18.0 の CHANGELOG の「互換性」の節に書くもの）

T2 の互換の扱い（旧 code → 新 code を書き、同じ日に houki-research-skill の `docs/ERROR-CODES.md` を直し、minor を上げる。旧 code を並行して返す期間は設けない）に従う。

| 場面                                                                      | 0.17.0                                                                                  | 0.18.0                                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 辞書に無い法令名で、e-Gov に題名の完全一致が無い（9 ツール）              | 成功（検索結果の先頭の法令）                                                            | `LAW_NOT_FOUND`（候補付き）                                         |
| law_id を決めた後に e-Gov が 404・`404004` / `404001`                     | `SOURCE_API_ERROR`（`retryable: false`）                                                | `LAW_NOT_FOUND`                                                     |
| `at` が 2017-04-01 より前（e-Gov が 400・`400044`）                       | `SOURCE_API_ERROR`（`retryable: false`）。`verify_citations` は件ごとの `LAW_NOT_FOUND` | `INVALID_ARGUMENT`（`path: "at"`）。`verify_citations` もツール全体 |
| `verify_citations` で `400044` 以外の 400                                 | 件ごとの `LAW_NOT_FOUND`                                                                | ツール全体の `SOURCE_API_ERROR`（`retryable: false`）               |
| `get_law` / `verify_citations` で、本則に無く附則にある条番号             | 附則の条を本則の条として返す（`found`）                                                 | `ARTICLE_NOT_FOUND`（附則の番号を案内）                             |
| `get_article_references` の本文の「附則第N条」                            | `kind: "internal"`（本則の条を指す）                                                    | `kind: "suppl"`、`resolved: false`。`kind` の値が 1 つ増える        |
| `get_article_references` の `target_law`                                  | 委任先が無いとキーが無い。省令は名前を問わず施行規則                                    | キーは常にあり、無い・確かでないときは `null`                       |
| `get_related_laws` に法律でない法令（末尾が「施行令」「施行規則」でない） | 名前を作って問い合わせ、`not_found` に入れる                                            | `related: []`・`not_found: []`、`note` に理由                       |
| `get_law` の json の `data`、`verify_citations` の `article`              | —                                                                                       | `suppl_index` を足す（本則の条は `null`）                           |

houki-research-skill で直すもの: `docs/ERROR-CODES.md` の `LAW_NOT_FOUND`・`INVALID_ARGUMENT` の行（場面の追加）。`kind` の一覧に `suppl` が書かれていれば足す。

## 呼び出し例への影響

2026-10-03 JST に houki-hub `scripts/reference-examples/houki-egov/ja/*.md` と houki-research-skill の `skills/houki-research/` を grep した。

- `at` を使う例は `2020-04-01`（hub の `get_law_file.md`）と `2027-01-01`（Skill の `electronic-bookkeeping.md`・`feasibility-check.md`）だけで、2017-04-01 より前は無い
- 法令名はどれも略称辞書に law_id がある名前か、e-Gov の題名と完全一致する名前（`国旗及び国歌に関する法律` など）で、候補付きの `LAW_NOT_FOUND` になる例は無い
- hub の `get_article_references.md` は所得税法第57条の2で、`財務省令で定める` の `target_law` は所得税法施行規則のまま（大蔵省令 → 財務省令）。本文の説明「`kind` は 3 つです」は、段階 6 で `suppl` を足して 4 つにする
- Skill の `feasibility-check.md` の電帳法第7条の例（`財務省令で定める` → `…法律施行規則` `410M50000040043`）は、施行規則が大蔵省令なら `target_law` は変わらない（施行規則の法令番号は確かめていない）

## 実装の変更

- 法令名から law_id を決める処理（`resolveLawId`）: 検索結果の全件を取り（`limit` を `total_count` まで上げるか `offset` で取り直す）、完全一致だけを採る。完全一致が無いときは候補を返し、各ツールが 032 の `LAW_NOT_FOUND` を組み立てる。`at` があれば `asof` を付ける。`verify_citations` の `resolveLawForVerify` と、`get_article_references` の `findLawByExactTitle` / `findLawByNum` も同じく全件・完全一致にする
- e-Gov の 4xx の振り分け（`egovHttpErrorToLawError` と `isLawIdRejected`）: 応答本文の `code`（`EgovHttpError.egovErrorCode()`）で `404004` / `404001` / `400044` を見分ける。`verify_citations` の `isLawIdRejected()` は 404 だけにする
- 条の探し方: 本則（`MainProvision`）の中だけを探す関数と、`suppl_index` の附則の中を探す関数に分ける（`get_toc` / `get_law_range` の附則の数え方を使う）。本則に無いときに、同じ番号の条を持つ附則の一覧を作る
- `get_law` / `verify_citations` の inputSchema に `suppl_index` を足し、`get_law` の json の `data.suppl_index`、`verify_citations` の `article.suppl_index` を常に置く
- 参照の抽出: 「附則第N条」を `kind: "suppl"` にする。施行規則の本文の「令」を兄弟の施行令に解決する。委任の命令の名前と施行規則の法令番号の命令の名前を、049 の表で照合する。施行規則の条からの `search_fulltext` の案内を作らない。`target_law` を常に置く
- `get_related_laws`: 解決した法令の `law_type` を使い、法律でなく末尾が「施行令」「施行規則」でもなければ候補を作らない

## 取り込みのとき（Publisher）

- ADDED の見出しを、各 `specs/current/<dir>/spec.md` の「できること」の末尾に足す。MODIFIED は見出しの行（題）も含めて、差分の見出しと本文に置き換える
- 各差分の spec.md の冒頭に書いた、ID の無い節の変更（「入力」の表、「処理の流れ」の図、「できないこと」、「未決」の行の削除、common_errors の「エラーの code」の表）を行う
- common_errors の差分は MODIFIED の 027・029・023 の順に並んでいるが、取り込み先では current の番号の位置で置き換える
- 「未決」から次の行を消す: get_law 12・15、get_toc 9、get_law_range 9、get_law_revisions 4、get_related_laws 6・7、get_article_references 13・14・15・16・17、verify_citations の「判断が要る項目」1・2・5（見出しごと）
- 各 `specs/current/<dir>/spec.md` の承認日の行に「差分 `20261003-law-resolution` は YYYY-MM-DD（PR #N）」を足す
- この差分のフォルダーを `specs/releases/<実装を出したタグ>/20261003-law-resolution/` へ移し、この proposal.md の「状態」を取り込み済みにする
- CHANGELOG の 0.18.0 に閉じる Issue（#45・#51・#63・#87）を列挙する。`Closes` は実装 PR の本文に書く

## 人が判断すること

1. **（#45）完全一致が無いときにエラーにすること（案 A）。** A で書いた。B（今のまま先頭の法令を返し、`match: "partial"` のような印と候補を応答に付ける）は、応答の外側（`isError`）を見る LLM には違う法令が成功として見えるので勧めない。A の代わりに失うのは「`所得税法施行` で所得税法施行令が返る」便利さで、`next_actions` の候補で 1 回の呼び直しになる。
2. **（#45）候補付きの `LAW_NOT_FOUND` の `next_actions` に、呼んだツール自身を候補ごとに入れること。** 候補は 5 件まで、最後に `search_law`。`resolve_abbreviation` は入れない側で書いた（部分一致があるので略称の書き間違いより題名の一部である見込みが高い）。0 件のときの `next_actions`（`resolve_abbreviation`・`search_law`）は今までどおり。候補を機械が読める形でも返すなら、`detail.candidates`（`law_id`・`title`・`law_num`・`law_type`）を足す案がある（COMMON-ERRORS-008 の `detail` のフィールドが増える）。
3. **（#45・#87）`at` を法令名の検索にも使うこと。** `verify_citations` だけでなく `at` を受け取る 8 ツールで使う側で書いた。改題した法令（例: 情報通信技術を活用した行政の推進等に関する法律）を旧題名と `at` で引けるようになる。逆に、今の題名と古い `at` を一緒に渡すと、その時点の題名と一致しないので候補付きの `LAW_NOT_FOUND` になる（候補に今の法令が入る）。`verify_citations` だけにする案もある。
4. **（#51）本則に限る案。** 限る側で書いた。限らずに附則の条に印（`suppl_index`）を付けて返す案は、「第100条」と書いた LLM の引用が附則の条を指して `found` になることは変わらないので、#51 の害が残る。
5. **（#51）`get_article_references` に `suppl_index` を設けないこと。** 本則の条だけを対象にする側で書いた（附則の条の参照は経過措置の読み取りで、条文の参照の抽出の主な用途から外れる）。設けるなら 043 と同じ形で足せる。
6. **（#63）省の改称の表（049）を spec.md に書くこと。** 表をデータとして仕様に固定した。houki-abbreviations に置く案もある（family で使うなら）。表に無い古い名前は `null` になるだけで、違う法令は指さない。
7. **（#63）`coverage.note` の文を変えるか。** 「委任先が確かでないときは `target_law: null`」を足すなら SPEC-EGOV-GET-ARTICLE-REFERENCES-020 の MODIFIED になる。この差分では足さず、tools/list の説明（実装 PR で直す文書 3）だけにした。
8. **（#87）`400044` の `message` の文。** `detail.issues[].message` は「e-Gov が受け付ける時点の範囲の外です」の固定の文にし、下限の日付（2017-04-01）は `hint` に e-Gov の `message` をそのまま入れて伝える。日付をこのサーバーに持つと、e-Gov が下限を変えたときに食い違うため。inputSchema に `formatMinimum` を書いて先に止める案は採らなかった。
9. **（#87）`verify_citations` で `400044` 以外の 400 をツール全体の `SOURCE_API_ERROR` にすること。** 今は件ごとの `LAW_NOT_FOUND` だが、400 は「法令が無い」ではないので T2 の規則に揃えた。実データで `400044`・`400004` 以外の 400 が law_id の取得で返る場面は見つけていない。
10. **承認日。** この proposal.md に承認日と PR 番号を書く。
