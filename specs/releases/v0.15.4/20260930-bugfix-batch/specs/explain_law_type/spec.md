# 差分: explain_law_type（20260930-bugfix-batch）

`specs/current/explain_law_type/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-EXPLAIN-LAW-TYPE-018 `Object.prototype` のプロパティの名前は知らない名前として `found: false` を返す

`name` が `toString`・`constructor`・`hasOwnProperty`・`valueOf`・`__proto__` など、JavaScript の `Object.prototype` のプロパティの名前であっても、収録している種別の名前・別名・法令種別コードのどれとも一致しないので、SPEC-EGOV-EXPLAIN-LAW-TYPE-005 と同じ `found: false` の応答を返す。応答は `name`（渡した値）・`found: false`・`hint`・`next_actions`（SPEC-EGOV-EXPLAIN-LAW-TYPE-014）を持ち、`info` と `related_tools` を持たない。エラーにはしない（`isError` を付けない）。

例: `name: "toString"` と `name: "constructor"` は、どちらも `found: false` で、`hint` は `知らない法令種別です。試せる名前: ` で始まり、`next_actions[0].action` は `list_known_law_types`、`next_actions[0].example.names` は `憲法`・`法律`・`政令`・`省令`・`規則`・`条例`・`告示`・`訓令`・`通達` を含む。応答に `info` は無い。`name: "hasOwnProperty"`・`name: "valueOf"`・`name: "__proto__"` も同じ。

（v0.15.3 までは、収録している種別の表をオブジェクトのプロパティとして引いていたため、これらの名前で `found: true` になり、応答に `info` が無かった。houki-egov-mcp #73）
