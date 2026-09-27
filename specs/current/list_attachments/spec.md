# 機能: list_attachments（法令の添付ファイルの一覧を返す）

- 機能 ID: EGOV
- 種類: ツール
- 版: current
- 承認日: 2026-09-28（PR #50）。差分 `20260928-undecided-to-issues` は 2026-09-28（PR #68）。差分 `20260928-untested-behaviors` は 2026-09-28（PR #76）
- 起こした元: v0.15.1 の `src/tools/definitions.ts`、`src/tools/handlers.ts`、`src/services/law-files.ts`、`src/services/law-tree.ts`（図の置き場所）、`src/services/law-service.ts`（法令名の解決・管轄の確認）、`src/services/egov-client.ts`、`src/config.ts`、`src/services/law-files.test.ts`
- 関連する Issue: houki-egov-mcp #19（添付ファイルと法令本文ファイル）

この文書は「このツールは何をするか」を書きます。どう実装しているか（関数名・テーブル名）は書きません。

## アクター

- MCP クライアント（Claude などの LLM、または CLI から呼ぶ人）。`law_name`（と任意で `at`）を渡して、その法令履歴に付いている添付ファイル（別表・様式・別記の図。jpg / pdf）の一覧を受け取る。一覧の `url` をそのまま開くか、pdf-reader-mcp の `read_url` に渡すか、`get_attachment` で保存する

## 入力

| 引数       | 必須 | 内容                                                                   |
| ---------- | ---- | ---------------------------------------------------------------------- |
| `law_name` | 必須 | 法令名または略称。例: `"戸籍法施行規則"`、`"国旗及び国歌に関する法律"` |
| `at`       | 任意 | 時点。`YYYY-MM-DD` 形式。その時点の法令履歴の添付ファイルの一覧になる  |

inputSchema に無い引数を渡したときの扱いは common_errors に書く。

## 処理の流れ

呼び出しを受けてから応答を返すまでに、何をどの順で確かめるかを示します。図の中の番号は「できること」の仕様 ID の末尾 3 桁です。

```mermaid
flowchart TD
  A["呼び出し（law_name・at）"] --> B{"略称辞書でこのサーバーの管轄外か"}
  B -- 管轄外 --> E1["OUT_OF_SCOPE を返す（009）"]
  B -- 管轄内・辞書に無い --> C{"法令名から法令を特定できるか"}
  C -- できない --> E2["LAW_NOT_FOUND を返す（009）"]
  C -- できる --> D["e-Gov から法令本文と添付の一覧を取る（at があればその時点の履歴。008）"]
  D --> F["添付の一覧と本文の図を src で突き合わせる（001）"]
  F --> G["各ファイルに url・種別・置き場所を付ける（001・002）。本文に無いファイルは location: null（003）。本文にだけある図も入れる（004）"]
  G --> H{"添付が 1 件以上あるか"}
  H -- ない --> I["count: 0 の成功応答（007）。zip_url は null（005）、next_actions は付けない（006）"]
  H -- ある --> J["zip_url を付ける（005）。get_attachment と、pdf があれば read_url を next_actions に入れる（006）"]
```

## できること

### SPEC-EGOV-LIST-ATTACHMENTS-001 添付ファイルの一覧を、取得 URL と種別付きで返す

e-Gov の法令本文に付く添付ファイルの一覧（`attached_files_info`）と、本文の中の図（`Fig` 要素）を `src` で突き合わせ、1 ファイル 1 要素の `attachments` を返す。ファイルの中身は返さない。応答は次のフィールドを持つ。

| フィールド                                                                       | 内容                                                                                                                        |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `meta.law_revision_id`                                                           | 添付ファイルが属する法令履歴 ID。例: `411AC0000000127_19990813_000000000000000`                                             |
| `meta.law_id` / `meta.title` / `meta.law_num` / `meta.retrieved_at` / `meta.url` | 法令 ID・題名・法令番号・取得日時・e-Gov の法令ページの URL                                                                 |
| `count`                                                                          | `attachments` の件数                                                                                                        |
| `attachments[].src`                                                              | 本文の `Fig` 要素の `src`。例: `./pict/H11HO127-001.jpg`。`get_attachment` の `src` にそのまま渡せる                        |
| `attachments[].file_name`                                                        | `src` の末尾のファイル名。例: `H11HO127-001.jpg`                                                                            |
| `attachments[].file_type`                                                        | 拡張子から決めた種別。例: `jpg`、`pdf`                                                                                      |
| `attachments[].content_type`                                                     | 拡張子から決めた Content-Type。`jpg` は `image/jpeg`、`pdf` は `application/pdf`                                            |
| `attachments[].url`                                                              | 認証なしで開ける取得 URL。`https://laws.e-gov.go.jp/api/2/attachment/<law_revision_id>?src=<src を URL エンコードしたもの>` |
| `attachments[].updated`                                                          | 正誤などで更新された日時（`attached_files_info` の `updated`）。例: `2024-07-25T00:20:13+09:00`                             |
| `attachments[].location`                                                         | 法令の中の置き場所（SPEC-EGOV-LIST-ATTACHMENTS-002）                                                                        |
| `zip_url`                                                                        | SPEC-EGOV-LIST-ATTACHMENTS-005                                                                                              |
| `note`                                                                           | 件数と種別ごとの内訳の説明                                                                                                  |
| `next_actions`                                                                   | SPEC-EGOV-LIST-ATTACHMENTS-006                                                                                              |

### SPEC-EGOV-LIST-ATTACHMENTS-002 各ファイルに、法令の中の置き場所を付ける

`attachments[].location` に、その図が本文のどこに置かれているかを入れる。

- 別記・様式などの中の図: `tag`（`AppdxNote`・`AppdxStyle` など）、`title`（見出し。例: `別記第一`、`附録第十一号様式`）、`related_article`（関係条文。例: `（第一条関係）`）。見出しと関係条文の前後の空白（全角空白を含む）は除き、続く空白は 1 つに詰める（例: `　出生の届書（日本産業規格Ａ列四番）（第五十九条関係）` → `出生の届書（日本産業規格Ａ列四番）（第五十九条関係）`）
- 条の中の図: `tag: "Article"`、`article`（e-Gov 形式の条番号。例: `1`）、`title`（条見出しと見出しの括弧書きを続けたもの。例: `第一条（国旗）`）
- 附則の中の図（別表・様式・条の中でないもの）: `tag: "SupplProvision"`、`amend_law_num`（附則の改正法番号。例: `平成一一年法律第一二七号`）

### SPEC-EGOV-LIST-ATTACHMENTS-003 本文に見つからないファイルは、置き場所を null にして数を知らせる

`attached_files_info` にあるが本文の `Fig` 要素に同じ `src` が無いファイルも `attachments` に入れ、`location` を `null` にする。そのようなファイルがあるときは、`note` に「<件数> 件は attached_files_info にあるが本文の Fig 要素に見つからず」の文を入れる。

### SPEC-EGOV-LIST-ATTACHMENTS-004 本文にだけある図も一覧に入れる

本文に `Fig` 要素があるが `attached_files_info` に無い図も `attachments` に入れる。このファイルには `updated` を付けず、`location` は本文の置き場所（SPEC-EGOV-LIST-ATTACHMENTS-002）を付ける。

### SPEC-EGOV-LIST-ATTACHMENTS-005 添付ファイルをまとめた zip の URL を返す

添付が 1 件以上ある法令では、`zip_url` に、その法令履歴の添付ファイルをまとめて取る URL `https://laws.e-gov.go.jp/api/2/attachment/<law_revision_id>`（`src` を付けない）を入れる。添付が無い法令では `zip_url` は `null`。

### SPEC-EGOV-LIST-ATTACHMENTS-006 1 件の保存と pdf の読み取りを案内する

添付が 1 件以上あるときは `next_actions` に、`get_attachment`（保存するときの呼び方）を入れる。pdf のファイルがあるときは、続けて `pdf-reader-mcp:read_url`（pdf の `url` を渡すと本文を読める）を入れる。添付が無い法令では `next_actions` を付けない。

### SPEC-EGOV-LIST-ATTACHMENTS-007 添付が無い法令は count 0 の成功応答にする

`attached_files_info` が空で本文に `Fig` 要素も無い法令（例: 民法）は、エラーにせず、`count: 0`・空の `attachments`・`zip_url: null` の成功応答を返す。`note` には「添付ファイルはありません」を含む文を入れる。

### SPEC-EGOV-LIST-ATTACHMENTS-008 時点（at）を渡すと、その時点の法令履歴の一覧になる

`at` を渡したときは、その時点の法令履歴の本文と添付の一覧を使う。`meta.law_revision_id` はその時点の履歴 ID、`meta.at` は渡した `at` になる。その履歴の `attached_files_info` が空でも、本文の `Fig` 要素にある図は一覧に入る。

### SPEC-EGOV-LIST-ATTACHMENTS-009 特定できない法令と管轄外の資料はエラーにする

- 法令名が略称辞書で別の MCP サーバーの管轄の資料（例: `所基通` = 所得税基本通達）に当たるときは、エラー `OUT_OF_SCOPE` を返す
- 法令名から法令を特定できないときは、エラー `LAW_NOT_FOUND` を返す

### SPEC-EGOV-LIST-ATTACHMENTS-010 一覧は attached_files_info の順、その後ろに本文にだけある図を本文の出現順に並べる

`attachments` は、まず e-Gov の `attached_files_info` に載っているファイルを載っている順に並べ、その後ろに、本文の `Fig` 要素にあって `attached_files_info` に無い図を本文での出現順に並べる。`attached_files_info` にあるファイルは、本文での位置にかかわらず前に来る。

例: `attached_files_info` が `./pict/z.jpg` → `./pict/fmt.pdf` → `./pict/other.pdf` の順で、本文の `Fig` 要素が出現順に `./pict/top.jpg`（本文の先頭）・`./pict/b.jpg`・`./pict/a.jpg`・…・`./pict/fmt.pdf`（別記様式の中）のとき、`attachments[].src` の並びは `./pict/z.jpg`・`./pict/fmt.pdf`・`./pict/other.pdf`・`./pict/top.jpg`・`./pict/b.jpg`・`./pict/a.jpg`・… になる。

### SPEC-EGOV-LIST-ATTACHMENTS-011 同じ src は 1 件にし、最初に出てきたものの値を使う

同じ `src` が 2 回以上出てきても、`attachments` には 1 件だけ入れる。

- `attached_files_info` に同じ `src` が 2 回あるときは、最初の要素の `updated` を使う。例: `./pict/z.jpg` が `updated: "U1"` と `updated: "U3"` で 2 回載っていると、`attachments` の `./pict/z.jpg` は 1 件で `updated` は `U1`
- 本文に同じ `src` の `Fig` 要素が 2 つあるときは、先に出てきた `Fig` 要素の置き場所を `location` に使う。例: `./pict/a.jpg` が第三十条の二の中と、本文の末尾（どの別表・条にも入らない場所）の 2 か所にあると、`attachments` の `./pict/a.jpg` は 1 件で `location` は `{ tag: "Article", article: "30_2", title: "第三十条の二" }`
- `count` は重複を除いた件数

### SPEC-EGOV-LIST-ATTACHMENTS-012 別表・書式・別図・付録の中の図の置き場所

SPEC-EGOV-LIST-ATTACHMENTS-002 の「別記・様式などの中の図」は、次の要素の中の図にも当たる。`location.tag` はその要素名、`location.title` は見出し（前後の空白を除き、続く空白は 1 つに詰める）、`location.related_article` は関係条文（`RelatedArticleNum` があるときだけ）。

| 図を含む要素 | `location.tag` | `location.title` にする見出し |
| ------------ | -------------- | ----------------------------- |
| 別表         | `AppdxTable`   | `AppdxTableTitle`             |
| 書式         | `AppdxFormat`  | `AppdxFormatTitle`            |
| 別図         | `AppdxFig`     | `AppdxFigTitle`               |
| 付録         | `Appdx`        | `ArithFormulaNum`             |

例:
- `AppdxTableTitle` が `　別表第一`、`RelatedArticleNum` が `（第三条関係）` の別表の中の図 → `{ tag: "AppdxTable", title: "別表第一", related_article: "（第三条関係）" }`
- `AppdxFormatTitle` が `別記様式第一` の書式の中の図 → `{ tag: "AppdxFormat", title: "別記様式第一" }`
- `AppdxFigTitle` が `別図第一` の別図の中の図 → `{ tag: "AppdxFig", title: "別図第一" }`
- `ArithFormulaNum` が `付録第一` の付録の中の図 → `{ tag: "Appdx", title: "付録第一" }`

### SPEC-EGOV-LIST-ATTACHMENTS-013 別表・様式・条・附則のどれにも入らない図は tag: "Law"

図が別記・様式・別表・書式・別図・付録・条・附則のどれの中にも無いとき（例: `LawBody` の直下の `FigStruct` にある図）は、`location` を `{ tag: "Law" }` にする。`title` などのほかのフィールドは付かない。

### SPEC-EGOV-LIST-ATTACHMENTS-014 附則の中の条にある図には、附則の改正法番号も付ける

附則（`SupplProvision`）の中の条（`Article`）にある図は、SPEC-EGOV-LIST-ATTACHMENTS-002 の「条の中の図」の `location`（`tag: "Article"`・`article`・`title`）に、その附則の改正法番号 `amend_law_num` を足す。

例: `AmendLawNum` が `令和二年法律第一号` の附則の第二条（見出し無し）にある図 → `{ tag: "Article", article: "2", title: "第二条", amend_law_num: "令和二年法律第一号" }`。本則の条にある図には `amend_law_num` は付かない。

### SPEC-EGOV-LIST-ATTACHMENTS-015 meta の法令 ID・題名・法令番号・取得日時・URL

`meta` の各フィールドは次の値になる。

- `meta.law_id`: 法令名から特定した法令 ID。例: `411AC0000000127`
- `meta.title`: 法令名から特定した法令の題名（e-Gov の法令検索で当たった法令の題名。略称辞書に法令 ID があるときは辞書の正式名）。例: `国旗及び国歌に関する法律`
- `meta.law_num`: 同じく特定した法令の法令番号。例: `平成十一年法律第百二十七号`
- `meta.retrieved_at`: 応答を作った日時の ISO 8601 文字列（UTC、例: `2026-09-27T20:32:08.782Z`）
- `meta.url`: `https://laws.e-gov.go.jp/law/<law_id>`。例: `https://laws.e-gov.go.jp/law/411AC0000000127`
- `meta.at`: `at` を渡したときだけ付き、渡した値になる。渡さないときはフィールドごと付かない

### SPEC-EGOV-LIST-ATTACHMENTS-016 next_actions の example の中身

SPEC-EGOV-LIST-ATTACHMENTS-006 の `next_actions` の各要素の `example` は次の値になる。

- `get_attachment`: `{ law_name: <渡した law_name>, src: <attachments の先頭の src>, save: true }`。例: `law_name: "テスト法"` で先頭が `./pict/z.jpg` なら `{ law_name: "テスト法", src: "./pict/z.jpg", save: true }`
- `pdf-reader-mcp:read_url`: `{ url: <attachments の中で最初に出てくる file_type: "pdf" のファイルの url> }`。例: 先頭が jpg で 2 番目が `./pict/fmt.pdf`、3 番目も pdf のとき、`{ url: "https://laws.e-gov.go.jp/api/2/attachment/<law_revision_id>?src=.%2Fpict%2Ffmt.pdf" }`

### SPEC-EGOV-LIST-ATTACHMENTS-017 e-Gov の応答に法令履歴 ID が無いときはエラーにする

e-Gov の法令本文の応答の `revision_info` に `law_revision_id` が無いときは、エラー `SOURCE_API_ERROR` を返す。`retryable` は `false`、`detail.url` は法令本文の API の URL `https://laws.e-gov.go.jp/api/2/law_data/<law_id>`（`at` を渡したときも `asof` は付かない）。

例: 法令 ID `LID1`、`at: "2020-01-01"` で、法令本文の応答に `law_revision_id` が無い → `{ code: "SOURCE_API_ERROR", retryable: false, detail: { url: "https://laws.e-gov.go.jp/api/2/law_data/LID1" } }`。

### SPEC-EGOV-LIST-ATTACHMENTS-018 法令本文の取得に失敗したときの code

e-Gov の法令本文の取得（`https://laws.e-gov.go.jp/api/2/law_data/<law_id>`）が失敗したときは、次のエラーを返す。どれも `detail.url` に法令本文の API の URL を入れる（`at` があれば `?asof=<at>` 付き）。

| e-Gov の応答                   | `code`                | `retryable` | そのほか                           |
| ------------------------------ | --------------------- | ----------- | ---------------------------------- |
| 429                            | `SOURCE_RATE_LIMITED` | `true`      | `detail.status: 429`               |
| 時間切れ                       | `SOURCE_TIMEOUT`      | `true`      | `detail.status` は付かない         |
| 5xx（例: 500・503）            | `SOURCE_API_ERROR`    | `true`      | `detail.status` に HTTP ステータス |
| 429 以外の 4xx（例: 400・404・403） | `SOURCE_API_ERROR`    | `false`     | `detail.status` に HTTP ステータス |

例: e-Gov が 404 を返す → `{ code: "SOURCE_API_ERROR", retryable: false, detail: { status: 404, url: "https://laws.e-gov.go.jp/api/2/law_data/LID1" } }`。

### SPEC-EGOV-LIST-ATTACHMENTS-019 429・5xx・ネットワークの失敗は取り直してから返す

法令本文の取得で e-Gov が 429 か 5xx を返したとき、または応答が来ないネットワークの失敗のときは、最大 3 回取り直す（最初の 1 回と合わせて最大 4 回）。途中で成功すれば、その結果で成功応答を返す。4 回とも失敗したときは SPEC-EGOV-LIST-ATTACHMENTS-018 の code を返す。

時間切れと、429 以外の 4xx は取り直さない（e-Gov への問い合わせは 1 回）。

例:
- 1 回目が 429、2 回目が 200 → 成功応答
- 4 回とも 500 → e-Gov への問い合わせは 4 回で、`SOURCE_API_ERROR`（`retryable: true`、`detail.status: 500`）
- 404 → 問い合わせは 1 回で、`SOURCE_API_ERROR`（`retryable: false`）

## できないこと

- 添付ファイルの中身（画像・pdf のバイト列や base64）を返すこと。返すのは URL だけで、取得・保存は `get_attachment` が行う
- pdf の添付の本文を読むこと（pdf-reader-mcp の `read_url` に `url` を渡す）
- 図の中身（別表の表の値など）をテキストにすること
- 複数の時点の添付の一覧を比べること（時点ごとに `at` を変えて呼ぶ）

## 未決

初版起こしで見つけた、意図か不具合かを人が決める項目です。決まったら「できること」に ID を振るか、`specs/changes/` の差分にします。

意図か不具合かの判断が要る項目は houki-egov-mcp の Issue に移し、ここには題と Issue の番号だけを残します。今の振る舞いのままでよくテストが無いだけの項目は、受入テストを書いてから「できること」に ID を振ります。

1. **e-Gov の法令検索が失敗したときも `LAW_NOT_FOUND` を返す。** → houki-egov-mcp #46
2. **`at` の形を確かめない。** → houki-egov-mcp #47
3. **一覧の並び順と重複の扱い。** → SPEC-EGOV-LIST-ATTACHMENTS-010・SPEC-EGOV-LIST-ATTACHMENTS-011
4. **別表・書式・別図・付録の置き場所と、どこにも当たらない図。** → SPEC-EGOV-LIST-ATTACHMENTS-012・SPEC-EGOV-LIST-ATTACHMENTS-013・SPEC-EGOV-LIST-ATTACHMENTS-014
5. **`meta` の `law_id`・`title`・`law_num`・`retrieved_at`・`url`。** → SPEC-EGOV-LIST-ATTACHMENTS-015
6. **`next_actions` の `example` の中身。** → SPEC-EGOV-LIST-ATTACHMENTS-016
7. **e-Gov の応答に法令履歴 ID が無いとき。** → SPEC-EGOV-LIST-ATTACHMENTS-017
8. **法令本文の取得に失敗したときの code。** → SPEC-EGOV-LIST-ATTACHMENTS-018・SPEC-EGOV-LIST-ATTACHMENTS-019
