# 差分: list_attachments（20261003-search-explain-attachment）

`specs/current/list_attachments/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 差分 `20261003-law-resolution` の SPEC-EGOV-LIST-ATTACHMENTS-018（MODIFIED）・024（ADDED）を取り込んだ後に、この差分を取り込む

## MODIFIED

### SPEC-EGOV-LIST-ATTACHMENTS-002 各ファイルに、法令の中の置き場所を付ける

`attachments[].location` に、その図が本文のどこに置かれているかを入れる。

- 別記・様式などの中の図: `tag`（`AppdxNote`・`AppdxStyle` など）、`title`（見出し。例: `別記第一`、`附録第十一号様式`）、`related_article`（関係条文。例: `（第一条関係）`）。見出しと関係条文の前後の空白（全角空白を含む）は除き、続く空白は 1 つに詰める（例: `　出生の届書（日本産業規格Ａ列四番）（第五十九条関係）` → `出生の届書（日本産業規格Ａ列四番）（第五十九条関係）`）
- 条の中の図: `tag: "Article"`、`article`（e-Gov 形式の条番号。例: `1`）、`title`（条見出しと見出しの括弧書きを続けたもの。例: `第一条（国旗）`）
- 附則の別表・様式・付録の中の図: SPEC-EGOV-LIST-ATTACHMENTS-025
- 附則の中の図（附則の別表・様式・付録・条のどれの中でもないもの）: `tag: "SupplProvision"`、`amend_law_num`（附則の改正法番号。例: `平成一一年法律第一二七号`）

## ADDED

### SPEC-EGOV-LIST-ATTACHMENTS-025 附則の別表・様式・付録の中の図には、その見出しと附則の改正法番号を付ける

附則（`SupplProvision`）の中の別表・様式・付録にある図は、附則全体（`{ tag: "SupplProvision", … }`）ではなく、その要素を置き場所にする。`location.tag` は e-Gov の要素名、`location.title` は見出し（前後の空白を除き、続く空白は 1 つに詰める。SPEC-EGOV-LIST-ATTACHMENTS-012 と同じ）、`location.related_article` は関係条文（`RelatedArticleNum` があるときだけ）、`location.amend_law_num` はその附則の改正法番号（制定時の附則で `AmendLawNum` が無いときは付けない。SPEC-EGOV-LIST-ATTACHMENTS-014 と同じ）。

| 図を含む要素       | `location.tag`                | `location.title` にする見出し      |
| ------------------ | ----------------------------- | ---------------------------------- |
| 附則の別表         | `SupplProvisionAppdxTable`    | `SupplProvisionAppdxTableTitle`    |
| 附則の様式         | `SupplProvisionAppdxStyle`    | `SupplProvisionAppdxStyleTitle`    |
| 附則の付録         | `SupplProvisionAppdx`         | `ArithFormulaNum`                  |

`get_attachment` の `location`（ファイル名で照合した一覧の要素の値。SPEC-EGOV-GET-ATTACHMENT-001）も同じ値になる。

例: `AmendLawNum` が `令和二年法律第一号` の附則の中に、`SupplProvisionAppdxTableTitle` が `附則別表第一`、`RelatedArticleNum` が `（附則第三条関係）` の `SupplProvisionAppdxTable` があり、その中に図 `./pict/s1.jpg` があるとき、`location` は `{ tag: "SupplProvisionAppdxTable", title: "附則別表第一", related_article: "（附則第三条関係）", amend_law_num: "令和二年法律第一号" }`（v0.17.0 では `{ tag: "SupplProvision", amend_law_num: "令和二年法律第一号" }` になる。この v0.17.0 の値は #72 が差し替えた XML で確かめたもの）。

2026-10-03 10:15 JST に e-Gov の国民年金法（`334AC0000000141`）・厚生年金保険法（`329AC0000000115`）・所得税法（`340AC0000000033`）・地方税法（`325AC0000000226`）の本文に `SupplProvisionAppdxTable` と `SupplProvisionAppdxTableTitle` の要素があることを確かめた。この 4 法令の附則の別表の中に図（`Fig`）は無かった。`SupplProvisionAppdxStyle`・`SupplProvisionAppdxStyleTitle`・`SupplProvisionAppdx` の要素と、附則の別表・様式の中に図がある実際の法令は確かめていない（要素名は e-Gov の法令標準 XML スキーマの名前に合わせた）。
