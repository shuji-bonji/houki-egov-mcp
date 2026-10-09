#!/usr/bin/env node
/**
 * PR が触ってよいパスを、ブランチ名の接頭辞で決めて検査する（AGENTS.md「PR の種類」）。
 *
 * | ブランチ        | 種類         | 変えてよいもの |
 * |-----------------|--------------|----------------|
 * | `spec/*`        | 仕様 PR      | `specs/changes/`。proposal.md の front matter が `implementation: none` なら `specs/current/` も |
 * | `spec-init/*`   | 初版起こし   | `specs/current/<dir>/spec.md` と、テスト名に仕様 ID を足すだけの変更 |
 * | それ以外        | 実装 PR など | `specs/changes/` は `specs/releases/` への移動だけ |
 *
 * `specs/{current,changes,releases}/.gitkeep`（`spec-ids init` が作る置き場の印）はどの種類でも検査しない。
 *
 * 承認の記録は、ファイルの先頭の front matter で見る（spec-ids 0.3.0 の形。読み取りは `@shuji-bonji/spec-ids` の
 * `readFrontMatter`）。次のどれかが欠けていれば止める。承認日と PR 番号は人がマージの前に書く。
 * - 仕様 PR の proposal.md: `approved` と `pr`（空でないこと）
 * - どの種類でも、変わった `specs/current/<dir>/spec.md`: `approved` と `pr`（初版の承認）、
 *   または `introduced_by`（差分で作った機能）
 * front matter の書式そのもの（キーの打ち間違い、値の形、古い「- 承認日:」の行）は `spec-ids check`（spec-gate）が見る。
 *
 * 使い方（CI）: BASE_REF=origin/main HEAD_REF=<ブランチ名> node .github/scripts/check-pr-scope.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readFrontMatter } from '@shuji-bonji/spec-ids';

const ID_WITH_SPACE_RE = /SPEC-[A-Z]+-[A-Z0-9-]+-[0-9]{3}\s*/g;
const ID_RE = /SPEC-[A-Z]+-[A-Z0-9-]+-[0-9]{3}/g;
const TEST_FILE_RE = /\.test\.[cm]?[jt]s$/;
const CURRENT_SPEC_RE = /^specs\/current\/[^/]+\/spec\.md$/;
const PROPOSAL_RE = /^specs\/changes\/[^/]+\/proposal\.md$/;
/** `spec-ids init` が作る置き場の印。どの種類の PR で足しても消してもよい */
/** `specs/changes/<id>/` の下のパス。<id> を取り出す */
const CHANGE_PATH_RE = /^specs\/changes\/([^/]+)\//;
const PLACEHOLDER_RE = /^specs\/(current|changes|releases)\/\.gitkeep$/;

/** front matter の値。front matter が無いファイルは空のオブジェクト（どのキーも無い）として扱う */
function frontMatterOf(text) {
  return readFrontMatter(text)?.data ?? {};
}

/** 値が空でないか（readFrontMatter は空の値を null で返す） */
function filled(value) {
  return value !== undefined && value !== null && value !== '';
}

/** 仕様 PR の proposal.md に、承認日と PR 番号があるか */
export function proposalApproved(text) {
  const fm = frontMatterOf(text);
  return filled(fm.approved) && filled(fm.pr);
}

/** proposal.md の差分が、実装の変更を要らないとしているか（`implementation: none`） */
export function noImplementation(text) {
  return frontMatterOf(text).implementation === 'none';
}

/** current の spec.md に、初版の承認（approved と pr）か、作った差分（introduced_by）があるか */
export function currentApproved(text) {
  const fm = frontMatterOf(text);
  return (filled(fm.approved) && filled(fm.pr)) || filled(fm.introduced_by);
}

/** ブランチ名から PR の種類を決める */
export function kindOf(branch) {
  if (branch.startsWith('spec/')) return 'spec';
  if (branch.startsWith('spec-init/')) return 'spec-init';
  return 'impl';
}

/** `git diff --name-status -M` の出力を { status, path, from } の配列にする */
export function parseNameStatus(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, a, b] = line.split('\t');
      return status.startsWith('R') ? { status: 'R', from: a, path: b } : { status, path: a };
    });
}

/**
 * `git diff -U0` の 1 ファイル分から、変わった行が「テスト名に仕様 ID を足しただけ」かを見る。
 * 消えた行と足された行を順に対にし、次の 3 つを満たせば true。
 * - 両方から ID を除くと同じ行になる（ID 以外の文字は変わっていない）
 * - 消えた行にあった ID は、足された行にもすべて残っている（ID を消していない）
 * - 足された行の ID の方が多い（何か足している）
 * すでに ID の付いたテスト名に、別の ID を足す場合も通す。
 */
export function onlyIdsAdded(unifiedDiff) {
  const removed = [];
  const added = [];
  for (const line of unifiedDiff.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++')) continue;
    if (line.startsWith('-')) removed.push(line.slice(1));
    else if (line.startsWith('+')) added.push(line.slice(1));
  }
  if (removed.length !== added.length) return false;
  return added.every((a, i) => {
    const r = removed[i];
    if (a.replace(ID_WITH_SPACE_RE, '') !== r.replace(ID_WITH_SPACE_RE, '')) return false;
    const before = r.match(ID_RE) ?? [];
    const after = a.match(ID_RE) ?? [];
    return before.every((id) => after.includes(id)) && after.length > before.length;
  });
}

/**
 * 変更の一覧と、ファイルを読む関数から、違反の一覧を返す。
 * `released` は `specs/releases/<tag>/` の下にある差分の <id> の集合。実装 PR では、取り込み済み（releases にある）差分の
 * `specs/changes/<id>/` に残ったファイルを消すことを許す（マージで移動前のコピーが残ったときの片付け）。
 * @param {{ kind: string, changes: Array<{status: string, path: string, from?: string}>, read: (p: string) => string, diffOf: (p: string) => string, released?: Set<string> }} input
 * @returns {string[]}
 */
export function checkScope({ kind, changes, read, diffOf, released = new Set() }) {
  const errors = [];
  const touched = (c) => [c.path, c.from].filter(Boolean);
  changes = changes.filter((c) => !PLACEHOLDER_RE.test(c.path));

  if (kind === 'spec') {
    const proposals = changes.filter((c) => c.status !== 'D' && PROPOSAL_RE.test(c.path));
    const noImpl = proposals.some((c) => noImplementation(read(c.path)));
    for (const c of changes) {
      for (const p of touched(c)) {
        if (p.startsWith('specs/changes/')) continue;
        if (noImpl && CURRENT_SPEC_RE.test(p)) continue;
        errors.push(
          `仕様 PR（spec/*）は specs/changes/ だけを変えます: ${p}${
            CURRENT_SPEC_RE.test(p)
              ? '（specs/current/ を書けるのは、proposal.md の front matter が implementation: none のときだけ）'
              : ''
          }`
        );
      }
    }
    if (proposals.length === 0) {
      errors.push('仕様 PR（spec/*）に specs/changes/<id>/proposal.md がありません');
    }
    for (const c of proposals) {
      if (!proposalApproved(read(c.path))) {
        errors.push(
          `承認日と PR 番号がありません（マージの前に front matter の approved と pr を書く）: ${c.path}`
        );
      }
    }
  } else if (kind === 'spec-init') {
    for (const c of changes) {
      if (CURRENT_SPEC_RE.test(c.path) && c.status !== 'D' && c.status !== 'R') continue;
      if (TEST_FILE_RE.test(c.path) && c.status === 'M') {
        if (!onlyIdsAdded(diffOf(c.path))) {
          errors.push(
            `初版起こし（spec-init/*）はテスト名に仕様 ID を足すだけです。それ以外の変更があります: ${c.path}`
          );
        }
        continue;
      }
      for (const p of touched(c)) {
        errors.push(
          `初版起こし（spec-init/*）は specs/current/<dir>/spec.md とテスト名だけを変えます: ${p}`
        );
      }
    }
  } else {
    for (const c of changes) {
      if (
        c.status === 'R' &&
        c.from.startsWith('specs/changes/') &&
        c.path.startsWith('specs/releases/')
      ) {
        continue;
      }
      if (c.status === 'D' && released.has(c.path.match(CHANGE_PATH_RE)?.[1] ?? '')) {
        continue;
      }
      for (const p of touched(c)) {
        if (p.startsWith('specs/changes/')) {
          errors.push(
            `仕様 PR の外で specs/changes/ を変えています（許されるのは specs/releases/ への移動だけ）: ${p}`
          );
        }
      }
    }
  }

  for (const c of changes) {
    if (c.status === 'D' || !CURRENT_SPEC_RE.test(c.path)) continue;
    if (!currentApproved(read(c.path))) {
      errors.push(
        `承認日と PR 番号がありません（マージの前に front matter の approved と pr を書く。差分で作った機能なら introduced_by）: ${c.path}`
      );
    }
  }
  return [...new Set(errors)];
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

/** `specs/releases/<tag>/<id>/` の <id> を集める */
function releasedIds() {
  const root = 'specs/releases';
  if (!existsSync(root)) return new Set();
  const ids = new Set();
  for (const tag of readdirSync(root, { withFileTypes: true })) {
    if (!tag.isDirectory()) continue;
    for (const id of readdirSync(`${root}/${tag.name}`, { withFileTypes: true })) {
      if (id.isDirectory()) ids.add(id.name);
    }
  }
  return ids;
}

function main() {
  const base = process.env.BASE_REF ?? 'origin/main';
  const branch = process.env.HEAD_REF ?? git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  const kind = kindOf(branch);
  const changes = parseNameStatus(git(['diff', '--name-status', '-M', `${base}...HEAD`]));
  const errors = checkScope({
    kind,
    changes,
    read: (p) => readFileSync(p, 'utf8'),
    diffOf: (p) => git(['diff', '-U0', `${base}...HEAD`, '--', p]),
    released: releasedIds(),
  });
  console.log(`branch: ${branch}（${kind}）、変更 ${changes.length} ファイル`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log('OK: この種類の PR が変えてよい範囲に収まっています');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
