# 差分: get_attachment（20261003-t4-response-shape）

`specs/current/get_attachment/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- 「処理の流れ」の図の「一覧の src かファイル名に一致するか（002）」の「する」の枝を、「src に一致する、またはファイル名で 1 件だけに当たる」と「ファイル名で 2 件以上に当たる → INVALID_ARGUMENT を返す。候補の src を next_actions に（029）」の 2 つに分ける

## ADDED

### SPEC-EGOV-GET-ATTACHMENT-029 ファイル名だけの src が 2 件以上の添付に当たるときは、どれも選ばずに `INVALID_ARGUMENT` を返し、候補の src を案内する

`src` が一覧のどの `src` とも一致せず、`src` の末尾のファイル名が一覧の 2 件以上の `file_name` に一致するときは、e-Gov からファイルを取らずに、エラー `INVALID_ARGUMENT` を返す。一覧で先にあるものを選んで返すことはしない。

- `tool`: `get_attachment`
- `retryable`: `false`
- `error`: `ファイル名 "<ファイル名>" の添付ファイルが <件数> 件あります。src を一覧の形で指定してください`
- `hint`: 当たった添付ファイルの `src` を一覧の順に最大 10 件（11 件以上なら末尾に `…`）
- `detail.issues`: `[{ path: "src", message: "同じファイル名の添付ファイルが複数あります" }]`
- `next_actions`: 当たった添付ファイルごとに 1 件（一覧の順に最大 10 件）。`action: "get_attachment"`、`reason: "この src を指定して取れます"`、`example` は `{ law_name: <渡した law_name>, src: <その添付の src> }` に、渡したときは `at` と `save` を加えたもの

`src` が一覧のどれかの `src` に一致するときは、同じファイル名の添付が別にあってもその添付を返す（SPEC-EGOV-GET-ATTACHMENT-002）。

例: 一覧に `./pict/a/H11HO127-001.jpg` と `./pict/b/H11HO127-001.jpg` がこの順にある法令で、`src: "H11HO127-001.jpg"` を渡すと、`code: "INVALID_ARGUMENT"`、`retryable: false`、`next_actions` は `example.src` が `./pict/a/H11HO127-001.jpg` と `./pict/b/H11HO127-001.jpg` の 2 件（v0.16.0 では `./pict/a/H11HO127-001.jpg` を黙って返していた）。`src: "./pict/b/H11HO127-001.jpg"` を渡すと、その添付を返す。

## MODIFIED

### SPEC-EGOV-GET-ATTACHMENT-002 src はファイル名だけでも、1 件に決まるなら引ける

`src` が一覧のどの `src` とも一致しないときは、`src` の末尾のファイル名を一覧の `file_name` と照らす。一致する添付が 1 件だけなら、その添付を対象にする。応答の `src` は一覧にある形（例: `H11HO127-001.jpg` を渡すと `./pict/H11HO127-001.jpg`）になる。2 件以上に一致するときは SPEC-EGOV-GET-ATTACHMENT-029、1 件も一致しないときは SPEC-EGOV-GET-ATTACHMENT-008 のエラーを返す。

例: 一覧の `file_name` が `H11HO127-001.jpg` の添付が `./pict/H11HO127-001.jpg` の 1 件だけなら、`src: "H11HO127-001.jpg"` はその添付を対象にし、応答の `src` は `./pict/H11HO127-001.jpg`。

### SPEC-EGOV-GET-ATTACHMENT-014 時点（at）を渡すと、その時点の法令履歴の添付を対象にする

`at` を渡したときは、その時点の法令履歴の本文と添付の一覧から対象のファイルを選ぶ。`meta.law_revision_id` はその時点の履歴 ID、`url` と `saved.path` にもその履歴 ID を使い、`meta.at` に渡した `at` を入れる。`at` を渡さないときは `meta.at` を `null` にする（キーは無くならない）。

例: `at: "2019-04-01"` で e-Gov がその時点の履歴 ID `LID1_20190401_X` を返す → `meta.law_revision_id: "LID1_20190401_X"`、`meta.at: "2019-04-01"`、`url: "https://laws.e-gov.go.jp/api/2/attachment/LID1_20190401_X?src=.%2Fpict%2Fa.jpg"`。`at` を渡さないときは `meta.at: null`（v0.16.0 では `at` のキーが無かった）。
