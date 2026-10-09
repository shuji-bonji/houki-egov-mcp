import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkScope,
  currentApproved,
  kindOf,
  noImplementation,
  onlyIdsAdded,
  parseNameStatus,
  proposalApproved,
} from './check-pr-scope.mjs';

/** front matter を組み立てる。値が null のキーは「キー:」だけ（空の値）にする */
function fm(fields, body) {
  const lines = Object.entries(fields).map(([k, v]) => (v === null ? `${k}:` : `${k}: ${v}`));
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

const APPROVED_PROPOSAL = fm(
  { approved: '2026-09-25', pr: 60, implementation: 'required', targets: '[resolve_abbreviation]' },
  '# 差分\n'
);
const NO_IMPL_PROPOSAL = APPROVED_PROPOSAL.replace('implementation: required', 'implementation: none');
const APPROVED_SPEC = fm({ spec_id: 'EGOV', kind: 'tool', approved: '2026-09-25', pr: 60 }, '# 機能\n');
const UNAPPROVED_SPEC = fm({ spec_id: 'EGOV', kind: 'tool', approved: null, pr: null }, '# 機能\n');

function run(kind, changes, files = {}, diffs = {}, released = new Set()) {
  return checkScope({
    kind,
    changes,
    read: (p) => files[p] ?? '',
    diffOf: (p) => diffs[p] ?? '',
    released,
  });
}

test('ブランチ名の接頭辞で種類が決まる', () => {
  assert.equal(kindOf('spec/20260925-live-scope'), 'spec');
  assert.equal(kindOf('spec-init/lookup-by-law-id'), 'spec-init');
  assert.equal(kindOf('fix/54-live-scope'), 'impl');
});

test('name-status の rename を from / path に分ける', () => {
  assert.deepEqual(parseNameStatus('M\tsrc/a.ts\nR100\tspecs/changes/x/spec.md\tspecs/releases/v1/x/spec.md\n'), [
    { status: 'M', path: 'src/a.ts' },
    { status: 'R', from: 'specs/changes/x/spec.md', path: 'specs/releases/v1/x/spec.md' },
  ]);
});

test('仕様 PR: specs/changes だけで承認日と PR 番号があれば通る', () => {
  const p = 'specs/changes/20260925-x/proposal.md';
  const errors = run('spec', [{ status: 'A', path: p }, { status: 'A', path: 'specs/changes/20260925-x/spec.md' }], {
    [p]: APPROVED_PROPOSAL,
  });
  assert.deepEqual(errors, []);
});

test('仕様 PR: src/ を変えると止まる', () => {
  const p = 'specs/changes/20260925-x/proposal.md';
  const errors = run('spec', [{ status: 'A', path: p }, { status: 'M', path: 'src/lookup.ts' }], {
    [p]: APPROVED_PROPOSAL,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /src\/lookup\.ts/);
});

test('仕様 PR: front matter の approved と pr が空なら止まる', () => {
  const p = 'specs/changes/20260925-x/proposal.md';
  const draft = fm({ approved: null, pr: null, implementation: 'required', targets: '[get_law]' }, '# 差分\n');
  const errors = run('spec', [{ status: 'A', path: p }], { [p]: draft });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /承認日と PR 番号/);
});

test('仕様 PR: approved があっても pr が空なら止まる', () => {
  const p = 'specs/changes/20260925-x/proposal.md';
  const noPr = APPROVED_PROPOSAL.replace('pr: 60', 'pr:');
  const errors = run('spec', [{ status: 'A', path: p }], { [p]: noPr });
  assert.equal(errors.length, 1);
});

test('仕様 PR: 古い形（本文の「- 承認日:」の行だけで front matter が無い）の proposal.md は止まる', () => {
  const p = 'specs/changes/20260925-x/proposal.md';
  const legacy = '# 差分\n\n- 承認日: 2026-09-25（PR #60）\n- 実装の変更: 要\n';
  const errors = run('spec', [{ status: 'A', path: p }], { [p]: legacy });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /front matter の approved と pr/);
});

test('仕様 PR: implementation: none なら specs/current も書いてよい（current の承認は要る）', () => {
  const p = 'specs/changes/20260925-x/proposal.md';
  const cur = 'specs/current/resolve_abbreviation/spec.md';
  const files = { [p]: NO_IMPL_PROPOSAL, [cur]: APPROVED_SPEC };
  assert.deepEqual(run('spec', [{ status: 'A', path: p }, { status: 'M', path: cur }], files), []);
  const noDate = { ...files, [cur]: UNAPPROVED_SPEC };
  assert.equal(run('spec', [{ status: 'A', path: p }, { status: 'M', path: cur }], noDate).length, 1);
});

test('仕様 PR: implementation: required で specs/current を書くと止まる', () => {
  const p = 'specs/changes/20260925-x/proposal.md';
  const cur = 'specs/current/resolve_abbreviation/spec.md';
  const errors = run('spec', [{ status: 'A', path: p }, { status: 'M', path: cur }], {
    [p]: APPROVED_PROPOSAL,
    [cur]: APPROVED_SPEC,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /implementation: none/);
});

test('仕様 PR: 本文の「- 実装の変更: 不要」の行だけでは specs/current を書けない', () => {
  const p = 'specs/changes/20260925-x/proposal.md';
  const cur = 'specs/current/resolve_abbreviation/spec.md';
  const legacy = `${APPROVED_PROPOSAL}- 実装の変更: 不要\n`;
  const errors = run('spec', [{ status: 'A', path: p }, { status: 'M', path: cur }], {
    [p]: legacy,
    [cur]: APPROVED_SPEC,
  });
  assert.equal(errors.length, 1);
});

test('実装 PR: specs/changes を releases へ移すのはよいが、書き換えると止まる', () => {
  const cur = 'specs/current/resolve_abbreviation/spec.md';
  const ok = run(
    'impl',
    [
      { status: 'M', path: 'src/lookup.ts' },
      { status: 'M', path: cur },
      { status: 'R', from: 'specs/changes/x/spec.md', path: 'specs/releases/v0.21.0/x/spec.md' },
    ],
    { [cur]: APPROVED_SPEC }
  );
  assert.deepEqual(ok, []);
  const ng = run('impl', [{ status: 'M', path: 'specs/changes/x/spec.md' }]);
  assert.equal(ng.length, 1);
});

test('実装 PR: 取り込んだ specs/current に初版の承認が無ければ止まる', () => {
  const cur = 'specs/current/resolve_abbreviation/spec.md';
  const errors = run('impl', [{ status: 'M', path: cur }], { [cur]: UNAPPROVED_SPEC });
  assert.equal(errors.length, 1);
  // 古い形（本文の「- 承認日:」の行だけ）も止める
  const legacy = '# 機能\n\n- 承認日: 2026-09-25（PR #60）\n';
  assert.equal(run('impl', [{ status: 'M', path: cur }], { [cur]: legacy }).length, 1);
});

test('実装 PR: 差分で作った機能（introduced_by）は approved と pr が無くても通る', () => {
  const cur = 'specs/current/cli_new/spec.md';
  const born = fm({ spec_id: 'EGOV', kind: 'cli', introduced_by: '20261004-db-location' }, '# 機能\n');
  assert.deepEqual(run('impl', [{ status: 'A', path: cur }], { [cur]: born }), []);
});

test('front matter の判定: 空の値・front matter の無い本文を「無い」とみなす', () => {
  assert.equal(proposalApproved(APPROVED_PROPOSAL), true);
  assert.equal(proposalApproved('# 差分\n'), false);
  assert.equal(noImplementation(NO_IMPL_PROPOSAL), true);
  assert.equal(noImplementation(APPROVED_PROPOSAL), false);
  assert.equal(currentApproved(APPROVED_SPEC), true);
  assert.equal(currentApproved(UNAPPROVED_SPEC), false);
});

test('初版起こし: spec.md の追加と、テスト名に ID を足すだけの変更は通る', () => {
  const cur = 'specs/current/lookup_by_law_id/spec.md';
  const t = 'src/lookup.test.ts';
  const diff = [
    `--- a/${t}`,
    `+++ b/${t}`,
    '@@ -1 +1 @@',
    "-  it('未知の law_id は null', async () => {",
    "+  it('SPEC-ABBR-LOOKUP-BY-LAW-ID-001 未知の law_id は null', async () => {",
  ].join('\n');
  const errors = run(
    'spec-init',
    [{ status: 'A', path: cur }, { status: 'M', path: t }],
    { [cur]: APPROVED_SPEC },
    { [t]: diff }
  );
  assert.deepEqual(errors, []);
});

test('初版起こし: テストの期待値を変えると止まる', () => {
  const t = 'src/lookup.test.ts';
  const diff = ['@@ -1 +1 @@', "-    expect(lookupByLawId('999XX0000000000')).toBeNull();", "+    expect(lookupByLawId('999XX0000000000')).toBeUndefined();"].join('\n');
  assert.equal(onlyIdsAdded(diff), false);
  const errors = run('spec-init', [{ status: 'M', path: t }], {}, { [t]: diff });
  assert.equal(errors.length, 1);
});

test('初版起こし: 承認日が無ければ止まる、src/ の実装を変えると止まる', () => {
  const cur = 'specs/current/lookup_by_law_id/spec.md';
  const errors = run('spec-init', [
    { status: 'A', path: cur },
    { status: 'M', path: 'src/lookup.ts' },
  ], { [cur]: UNAPPROVED_SPEC });
  assert.equal(errors.length, 2);
});

test('specs に触れない PR（docs など）はそのまま通る', () => {
  assert.deepEqual(run('impl', [{ status: 'M', path: 'README.md' }]), []);
});

test('spec-ids init が作る specs/ の .gitkeep は、どの種類の PR でも止めない', () => {
  const keeps = ['current', 'changes', 'releases'].map((d) => ({ status: 'A', path: `specs/${d}/.gitkeep` }));
  for (const kind of ['impl', 'spec-init']) {
    assert.deepEqual(run(kind, keeps), []);
  }
  assert.equal(run('impl', [{ status: 'A', path: 'specs/changes/x/spec.md' }]).length, 1);
});

test('実装 PR: 取り込み済み（releases にある）差分の specs/changes/ に残ったファイルは消してよい', () => {
  const d = { status: 'D', path: 'specs/changes/20260927-x/proposal.md' };
  assert.deepEqual(run('impl', [d], {}, {}, new Set(['20260927-x'])), []);
  // releases に無い差分を消すのは止める
  assert.equal(run('impl', [d], {}, {}, new Set(['20260927-y'])).length, 1);
});

test('初版起こし: すでに ID の付いたテスト名に別の ID を足すのは通す', () => {
  const diff = [
    '@@ -1 +1 @@',
    "-  it('SPEC-EGOV-GET-LAW-001 範囲外の名前は OUT_OF_SCOPE', async () => {",
    "+  it('SPEC-EGOV-GET-LAW-001 SPEC-EGOV-COMMON-ERRORS-004 範囲外の名前は OUT_OF_SCOPE', async () => {",
  ].join('\n');
  assert.equal(onlyIdsAdded(diff), true);
});

test('初版起こし: ID を別の ID に差し替えるのは止める', () => {
  const swap = [
    '@@ -1 +1 @@',
    "-  it('SPEC-EGOV-GET-LAW-001 範囲外の名前は OUT_OF_SCOPE', async () => {",
    "+  it('SPEC-EGOV-GET-LAW-002 範囲外の名前は OUT_OF_SCOPE', async () => {",
  ].join('\n');
  assert.equal(onlyIdsAdded(swap), false);
});
