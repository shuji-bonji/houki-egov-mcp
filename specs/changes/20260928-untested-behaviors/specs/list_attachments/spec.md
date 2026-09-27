# 差分: list_attachments（20260928-untested-behaviors）

`specs/current/list_attachments/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

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
