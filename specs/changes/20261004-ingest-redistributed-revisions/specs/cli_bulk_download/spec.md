# 差分: cli_bulk_download（20261004-ingest-redistributed-revisions）

`specs/current/cli_bulk_download/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 冒頭の「関連する Issue」に `houki-egov-mcp #107（0.19.1）` を足す
- 「処理の流れ」の図の `K -- 同じ --> L["unchanged として数え、書き換えない（014）"]` を、次の 2 つの枝に置き換える
  - `K -- 同じ --> K2{"DB が UnEnforced で、CSV の未施行の欄が空か（031）"}`
  - `K2 -- いいえ --> L["unchanged として数え、書き換えない（014）"]`
  - `K2 -- はい --> L2["unchanged として数え、状態だけを現行にする。現行の版を 1 つにそろえる（031・016）"]`、`L2 --> N`
- 同じ図の `N` の後に、`N --> O{"全件の取り込みか"}`、`O -- はい --> O2["CSV に無い未施行の版を前の版にする（033）"]`、`件数の表示（032）` を足す
- 「できないこと」の「前の版・廃止を e-Gov の履歴から正確に判定すること」の括弧の中を、次にする: `現行・未施行は CSV の未施行の欄から、前の版は SPEC-EGOV-CLI-BULK-DOWNLOAD-016 と 033 で決めるだけ。廃止は扱わない`

## MODIFIED

### SPEC-EGOV-CLI-BULK-DOWNLOAD-011 取り込む法令の情報

1 つの版について、XML から法令名・法令番号・法令名の読み・略称（XML にあれば。無ければ空）・法令種別（例: `CabinetOrder`）を、CSV から版の ID・法令ID・施行日（`YYYY-MM-DD`）・未施行かどうかを取り込む。公布日は XML の `Law` の元号（`Era`）・年（`Year`）・月（`PromulgateMonth`）・日（`PromulgateDay`）から西暦の `YYYY-MM-DD` にする（例: 明治 5 年 11 月 9 日 → `1872-11-09`）。次のときは公布日を作れないので `NULL` にする（SPEC-EGOV-DB-SCHEMA-027）。

- 元号・年・月・日のどれかが XML に無い
- 元号が `Meiji`・`Taisho`・`Showa`・`Heisei`・`Reiwa` のどれでもない
- 年が 1 以上の整数でない

未施行の欄が `○` の版は「未施行」（`UnEnforced`）、それ以外は「現行」（`CurrentEnforced`）として入る。施行日が取り込んだ日（日本時間）より後でも、未施行の欄が空なら「現行」として入る（e-Gov の CSV の欄に従い、施行日と今日を比べない）。同じ版が後の zip で未施行の欄を空にして届いたときは SPEC-EGOV-CLI-BULK-DOWNLOAD-031 のとおり状態を書き換える。CSV に複数の法令があれば全部を入れる。

例: `PromulgateDay` の無い XML の法令は `promulgation_date` が `NULL`（v0.18.x では `0001-01-01`）。`Era="Meiji" Year="05" PromulgateMonth="11" PromulgateDay="09"` は `1872-11-09`。

例: e-Gov は施行日の前日の差分に、未施行の欄を空にした版を入れることがある（2026-09-30 の差分に、施行日 2026-10-01 の版が 34 件。houki-egov-mcp #107 の本文、2026-10-04 JST の実測）。この版を 2026-09-30 に取り込むと `CurrentEnforced` になり、同じ法令の施行日がより前の現行の版は `PreviousEnforced` になる（SPEC-EGOV-CLI-BULK-DOWNLOAD-016）。`search_fulltext` は施行日の 1 日前から新しい版の条文を返す。

### SPEC-EGOV-CLI-BULK-DOWNLOAD-014 中身が前回と同じ法令は書き換えない

同じ版の ID の法令を前に取り込んでいて、XML の中身が同じときは、その法令の情報と条の本文を書き換えず（取得日時も前回のまま）、`unchanged` として数える。ただし、DB の状態が未施行（`UnEnforced`）で、今回の CSV の未施行の欄が空のときは、状態だけを書き換える（SPEC-EGOV-CLI-BULK-DOWNLOAD-031。このときも `unchanged` として数える）。XML の中身が変わっていれば、法令の情報を更新し、その版の条の本文をすべて入れ替え、`upsert` として数える。取り込みのしかた（XML の読み方や文字のそろえ方）が変わった版の houki-egov-mcp で `--bulk-download-everything` をやり直すと、XML が同じでも全件を入れ直す。

例: 同じ zip を 2 回取り込むと、2 回目は全件が `unchanged` で、法令の取得日時（`fetched_at`）も条の本文も 1 回目のまま。

### SPEC-EGOV-CLI-BULK-DOWNLOAD-016 同じ法令の現行の版は、施行日が最も新しい 1 つだけにする

現行の版を取り込むとき、同じ法令ID に施行日がそれより前の現行の版があれば、それを「前の版」（`PreviousEnforced`）にする。逆に、施行日がより新しい現行の版がすでにあれば、取り込んだ版のほうを「前の版」にする。SPEC-EGOV-CLI-BULK-DOWNLOAD-031 で状態だけを現行にした版も、取り込んだ現行の版として同じように比べる。1 つの zip の中で同じ法令の新しい版が先、古い版が後に並んでいても、新しい版が現行として残る。未施行の版を取り込んでも、現行の版はそのまま残る。施行日の無い版はこの比較をしない。

例: 医師法施行規則（`323M40000100047`）の `…_20260917_508M60000100132` が `UnEnforced`、`…_20260814_508M60000100128` が `CurrentEnforced` の DB に、2026-09-17 の差分で `…_20260917_…` が XML を変えずに未施行の欄を空にして届くと、`…_20260917_…` が `CurrentEnforced`、`…_20260814_…` が `PreviousEnforced` になる（SPEC-EGOV-CLI-BULK-DOWNLOAD-031 の例の 2 段目）。

## ADDED

### SPEC-EGOV-CLI-BULK-DOWNLOAD-031 中身が同じでも、未施行の欄が空になって届いた未施行の版は、状態だけを現行にする

同じ版の ID の法令が DB にあり、XML の中身が前回と同じ（SPEC-EGOV-CLI-BULK-DOWNLOAD-014）で、DB の `current_revision_status` が `UnEnforced`、今回の CSV のその行の未施行の欄が `○` でない（空の）ときは、次のとおりにする。全件の取り込み（`--bulk-download-everything`）・1 日分の差分の取り込み（`--bulk-download-by-date`）・`--sync` のどれでも同じ。

- その版の `current_revision_status` を `CurrentEnforced` にし、SPEC-EGOV-CLI-BULK-DOWNLOAD-016 の比較を通す（同じ法令の、施行日がより前の現行の版を `PreviousEnforced` にする。施行日がより新しい現行の版がすでにあれば、この版を `PreviousEnforced` にする）
- `laws` の `current_revision_status` 以外の列（`content_hash`・`fetched_at`・`updated` を含む）、条の本文（`articles` と全文検索の索引）、法令名の索引は書き換えない
- `unchanged` として数え、あわせて `status_changed`（状態だけを書き換えた版の数）にも数える（表示は SPEC-EGOV-CLI-BULK-DOWNLOAD-032・SPEC-EGOV-CLI-SYNC-020）

次のときは、今までどおり何も書き換えない（`unchanged` にだけ数える）。

- DB が `UnEnforced` で、CSV の未施行の欄も `○`
- DB が `CurrentEnforced` か `PreviousEnforced`。CSV の未施行の欄が `○` で届いても `UnEnforced` に戻さない

e-Gov は、施行日の当日の差分に、公布の日に未施行の欄 `○` で配った版を、同じ版の ID・同じ XML のまま、未施行の欄を空にしてもう一度入れる（houki-egov-mcp #107 の本文。2026-09-01〜2026-10-02 の差分で、`○` から空に変わった版が 48 件、48 件とも施行日の当日の差分で、XML はバイト単位で前回と同じ。2026-10-04 JST の実測）。全件の zip も、施行済みの版は未施行の欄が空なので、v0.19.0 で状態が `UnEnforced` のまま残った DB は、`--bulk-download-everything` を 1 回実行するとこの規則と SPEC-EGOV-CLI-BULK-DOWNLOAD-033 で直る（`INGEST_VERSION` を上げず、条の本文は入れ直さない）。

例: 空の DB に、医師法施行規則（`323M40000100047`）を含む 2026-09-02 → 2026-09-17 → 2026-10-01 の差分 zip を順に取り込むと、4 つの版は次のとおりになる。

| 版の ID | v0.19.0 の取り込み後の状態 | この規則での状態 |
| --- | --- | --- |
| `323M40000100047_20260814_508M60000100128` | `CurrentEnforced` | `PreviousEnforced` |
| `323M40000100047_20260917_508M60000100132` | `UnEnforced` | `PreviousEnforced` |
| `323M40000100047_20261001_508M60000100107` | `UnEnforced` | `CurrentEnforced` |
| `323M40000100047_20270401_508M60000100128` | `UnEnforced` | `UnEnforced` |

`…_20260917_…` は 2026-09-17 の差分で（`…_20260814_…` を `PreviousEnforced` にする）、`…_20261001_…` は 2026-10-01 の差分で（`…_20260917_…` を `PreviousEnforced` にする）、それぞれ状態だけが `CurrentEnforced` になる。`…_20270401_…` は未施行の欄が `○` のままなので変わらない。

v0.19.0（main `f3b7fc1`）の件数は、09-02 が `upserted: 26`、09-17 が `upserted: 14`・`unchanged: 5`、10-01 が `upserted: 338`・`unchanged: 5` で、`unchanged` の 5 件が配り直された版だった（houki-egov-mcp #107 の本文。2026-10-04 JST に main `f3b7fc1` のクローンで `ingestZip` を順に実行した結果）。この規則では `upserted` と `unchanged` の数は変わらず、`unchanged` のうち状態を書き換えた版が `status_changed` に数えられる（09-17・10-01 の `status_changed` の数は確かめていない）。

### SPEC-EGOV-CLI-BULK-DOWNLOAD-032 状態だけを書き換えた版があれば、取り込みの件数の後に 1 行出す

`--bulk-download-everything` と `--bulk-download-by-date` は、`status_changed`（SPEC-EGOV-CLI-BULK-DOWNLOAD-031 と 033 で状態だけを書き換えた版の数）が 1 以上のとき、`  ingest 完了: …` の行（SPEC-EGOV-CLI-BULK-DOWNLOAD-020 の 6、021 の 6）のすぐ後に、標準エラー出力に次の 1 行を出す。0 のときは出さない。`  ingest 完了: …` の行の形と、ほかの行は変えない。終了コードも変えない。

```
  状態の更新: <status_changed> 件 (条の本文はそのまま、未施行 (UnEnforced) だった版の状態だけを書き換え)
```

例: 2026-10-01 の差分 zip を `--bulk-download-by-date 20261001` で取り込み、配り直された 5 版の状態を書き換えたときは、`  ingest 完了: 338 件 upsert, 5 件 unchanged (<時間>)` と `  状態の更新: 5 件 (条の本文はそのまま、未施行 (UnEnforced) だった版の状態だけを書き換え)` を出す（件数は houki-egov-mcp #107 の実測の 338・5 を当てはめたもの。0.19.1 で実行した値ではない）。

### SPEC-EGOV-CLI-BULK-DOWNLOAD-033 全件の取り込みでは、全件の CSV に無い未施行の版を前の版にする

`--bulk-download-everything` は、CSV のすべての行を取り込んだ後（同期の状態を書く前）に、DB の `current_revision_status` が `UnEnforced` の版のうち、次の 3 つをすべて満たす版を `PreviousEnforced` にし、`status_changed` に数える。条の本文と、`current_revision_status` 以外の列は書き換えない。

- 今回の全件の CSV に、その版の ID の行が無い
- 同じ法令ID に `CurrentEnforced` の版がある
- その版の施行日が、その `CurrentEnforced` の版の施行日以前（同じ日を含む）

施行日の無い版、同じ法令に現行の版が無い版、施行日が現行の版より後の版は、`UnEnforced` のまま残す。`--bulk-download-by-date` と `--sync` ではこの処理をしない（1 日分の差分は全件の版を含まないため）。

全件の zip は、法令ごとに現行の版 1 つと、公布済みで未施行の版のすべてを入れ、施行済みで置き換わった前の版を入れない（houki-egov-mcp #107 の本文。2026-10-04 JST の実測で 10,414 版、うち未施行の欄が `○` の版が 1,410）。全件の CSV に無い `UnEnforced` の版は、施行されて別の版に置き換わった版である。

例: SPEC-EGOV-CLI-BULK-DOWNLOAD-031 の表の「v0.19.0 の取り込み後の状態」の DB に、2026-10-02 以降の全件の zip（`…_20261001_…` が未施行の欄が空、`…_20270401_…` が `○`、`…_20260814_…` と `…_20260917_…` は入っていない）を取り込むと、`…_20261001_…` は 031 で `CurrentEnforced` に、`…_20260814_…` は 016 で `PreviousEnforced` に、`…_20260917_…` はこの規則で `PreviousEnforced` になり、4 版とも表の「この規則での状態」になる（全件の zip の中身はこの 1 法令については確かめていない。Issue の「全件 zip の配り方」からの推定）。
