/**
 * 差分 20261003-t4-response-shape の受入テスト — get_attachment のファイル名だけの src
 *
 * 期待値の正本: specs/changes/20261003-t4-response-shape/specs/get_attachment/spec.md
 * 法令本文の応答（/law_data）の attached_files_info に、同じファイル名の添付を並べる。
 * /attachment への問い合わせは、呼ばれたら失敗させる（save なしでは呼ばない、曖昧なときは save でも呼ばない）。
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type Harness,
  lawDataResponse,
  MINPO,
  simpleLawTree,
  startHarness,
} from '../../test-helpers/mcp-harness.js';

const A = './pict/a/H11HO127-001.jpg';
const B = './pict/b/H11HO127-001.jpg';
const C = './pict/c.jpg';

describe('get_attachment のファイル名だけの src（20261003-t4-response-shape）', () => {
  let h: Harness;
  let srcs: string[];
  let dir: string;
  let savedDir: string | undefined;

  beforeEach(async () => {
    savedDir = process.env.HOUKI_EGOV_FILES_DIR;
    dir = mkdtempSync(join(tmpdir(), 'houki-egov-t4-att-'));
    process.env.HOUKI_EGOV_FILES_DIR = dir;
    srcs = [A, B, C];
    h = await startHarness((url) => {
      if (url.pathname.includes('/law_data/')) {
        return lawDataResponse(MINPO, simpleLawTree('民法'), srcs);
      }
      return null;
    });
  });
  afterEach(async () => {
    await h.close();
    if (savedDir === undefined) delete process.env.HOUKI_EGOV_FILES_DIR;
    else process.env.HOUKI_EGOV_FILES_DIR = savedDir;
    rmSync(dir, { recursive: true, force: true });
  });

  const attachmentCalls = () => h.urls().filter((u) => u.pathname.includes('/attachment/'));

  it('SPEC-EGOV-GET-ATTACHMENT-029 ファイル名だけの src が 2 件に当たると INVALID_ARGUMENT で、候補の src を一覧の順に案内する', async () => {
    const r = await h.call('get_attachment', { law_name: '民法', src: 'H11HO127-001.jpg' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.tool).toBe('get_attachment');
    expect(r.body.retryable).toBe(false);
    expect(r.body.error).toBe(
      'ファイル名 "H11HO127-001.jpg" の添付ファイルが 2 件あります。src を一覧の形で指定してください'
    );
    expect(r.body.hint).toContain(A);
    expect(r.body.hint).toContain(B);
    expect(r.body.hint.indexOf(A)).toBeLessThan(r.body.hint.indexOf(B));
    expect(r.body.hint).not.toContain(C);
    expect(r.body.detail.issues).toEqual([
      { path: 'src', message: '同じファイル名の添付ファイルが複数あります' },
    ]);
    expect(r.body.next_actions).toEqual([
      {
        action: 'get_attachment',
        reason: 'この src を指定して取れます',
        example: { law_name: '民法', src: A },
      },
      {
        action: 'get_attachment',
        reason: 'この src を指定して取れます',
        example: { law_name: '民法', src: B },
      },
    ]);
    expect(attachmentCalls()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-029 at と save を渡したときは、候補の例にも at と save を入れ、ファイルは取らない', async () => {
    const r = await h.call('get_attachment', {
      law_name: '民法',
      src: 'H11HO127-001.jpg',
      at: '2020-04-01',
      save: true,
    });
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.next_actions.map((a: { example: unknown }) => a.example)).toEqual([
      { law_name: '民法', src: A, at: '2020-04-01', save: true },
      { law_name: '民法', src: B, at: '2020-04-01', save: true },
    ]);
    expect(attachmentCalls()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-029 11 件以上に当たると hint と next_actions は一覧の順に最初の 10 件で、hint の末尾に … を付ける', async () => {
    srcs = Array.from({ length: 11 }, (_, i) => `./pict/d${i + 1}/x.jpg`);
    const r = await h.call('get_attachment', { law_name: '民法', src: 'x.jpg' });
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.error).toBe(
      'ファイル名 "x.jpg" の添付ファイルが 11 件あります。src を一覧の形で指定してください'
    );
    expect(r.body.next_actions).toHaveLength(10);
    expect(r.body.next_actions.map((a: { example: { src: string } }) => a.example.src)).toEqual(
      srcs.slice(0, 10)
    );
    for (const s of srcs.slice(0, 10)) expect(r.body.hint).toContain(s);
    expect(r.body.hint).not.toContain('./pict/d11/x.jpg');
    expect(r.body.hint.endsWith('…')).toBe(true);
    const ten = srcs.slice(0, 10);
    srcs = ten;
    const exact = await h.call('get_attachment', {
      law_name: '民法',
      src: 'x.jpg',
      at: '2019-04-01',
    });
    expect(exact.body.hint.endsWith('…')).toBe(false);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-029 src が一覧の src に一致すれば、同じファイル名の添付が別にあってもその添付を返す', async () => {
    const r = await h.call('get_attachment', { law_name: '民法', src: B });
    expect(r.isError).toBe(false);
    expect(r.body.kind).toBe('file');
    expect(r.body.src).toBe(B);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-002 ファイル名だけの src が 1 件だけに当たれば、その添付を対象にし、src は一覧の形', async () => {
    const r = await h.call('get_attachment', { law_name: '民法', src: 'c.jpg' });
    expect(r.isError).toBe(false);
    expect(r.body.src).toBe(C);
    expect(r.body.file_name).toBe('c.jpg');
  });

  it('SPEC-EGOV-GET-ATTACHMENT-002 ファイル名がどれにも当たらなければ ATTACHMENT_NOT_FOUND のまま', async () => {
    const r = await h.call('get_attachment', { law_name: '民法', src: 'none.jpg' });
    expect(r.body.code).toBe('ATTACHMENT_NOT_FOUND');
  });
});
