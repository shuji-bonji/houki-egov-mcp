# 差分: cli_status（20261004-ingest-redistributed-revisions）

`specs/current/cli_status/spec.md` に対する差分です。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 冒頭の「関連する Issue」に `houki-egov-mcp #107（0.19.1）` を足す
- 「処理の流れ」の図で、`W --> Z` と `F -- いいえ --> Z["終わる"]` の間に、`施行日を過ぎた未施行の版を数え、1 件以上なら [WARN] を出す（012）` の箱を入れる

## ADDED

### SPEC-EGOV-CLI-STATUS-012 施行日を過ぎても未施行のままの版があれば `[WARN]` で全件の取り込みを案内する

同期の状態があり、同期の欄（SPEC-EGOV-CLI-STATUS-002・003）を出せたときは、DB の `laws` のうち、`current_revision_status` が `UnEnforced` で、`amendment_enforcement_date` が `last_sync_date` より前（同じ日を含まない）の版を数える。1 件以上なら、同期の欄と、その後の警告（SPEC-EGOV-CLI-STATUS-004）または `--sync` の案内（007）の行の後に、標準出力に次の 1 行を出す。0 件なら出さない。終了コードは 0 のまま変えない。標準エラー出力には出さない。

```
[WARN] 施行日が last_sync_date (<last_sync_date>) より前なのに未施行 (UnEnforced) のままの版が <件数> 件あります。houki-egov-mcp --bulk-download-everything を 1 回実行すると直ります（全件の zip 約 290 MB を取得します。条の本文は入れ直しません）
```

文は SPEC-EGOV-CLI-SYNC-021 と同じ。数える条件も同じで、比べる日は今日ではなく `last_sync_date`（同期していない日の配り直しは `--sync` で取り込めるので、`--bulk-download-everything` を案内しない）。`amendment_enforcement_date` が `NULL` の版は数えない。同期の状態が無いとき（001）、DB が無いとき（010）、版が合わないとき（011）、DB を開けないとき（006）、同期の記録を読めないとき（009）は数えず、出さない。ネットワークには出ない。

例: `last_sync_date` が `2026-10-06` で、施行日 `2026-10-05` の `UnEnforced` の版が 5 つある DB に、2026-10-07（日本時間）に `--status` を実行すると、同期の欄（`days_since_sync: 1`、`staleness: fresh`）と `  差分を取り込むには --sync を実行してください` の後に、`[WARN] 施行日が last_sync_date (2026-10-06) より前なのに未施行 (UnEnforced) のままの版が 5 件あります。…` を出して終了コード 0。`last_sync_date` が `2026-10-05` なら、施行日 `2026-10-05` の版は数えない（同じ日を含まない）ので出さない。
