# 差分: list_attachments（20261003-t4-response-shape）

`specs/current/list_attachments/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える

## MODIFIED

### SPEC-EGOV-LIST-ATTACHMENTS-015 meta の法令 ID・題名・法令番号・取得日時・URL・時点

`meta` の各フィールドは次の値になる。

- `meta.law_id`: 法令名から特定した法令 ID。例: `411AC0000000127`
- `meta.title`: 法令名から特定した法令の題名（e-Gov の法令検索で当たった法令の題名。略称辞書に法令 ID があるときは辞書の正式名）。例: `国旗及び国歌に関する法律`
- `meta.law_num`: 同じく特定した法令の法令番号。例: `平成十一年法律第百二十七号`
- `meta.retrieved_at`: 応答を作った日時の ISO 8601 文字列（UTC、例: `2026-09-27T20:32:08.782Z`）
- `meta.url`: `https://laws.e-gov.go.jp/law/<law_id>`。例: `https://laws.e-gov.go.jp/law/411AC0000000127`
- `meta.at`: 渡した `at`。渡さないときは `null`（v0.16.0 ではフィールドごと付かなかった）
