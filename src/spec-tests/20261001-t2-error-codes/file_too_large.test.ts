/**
 * 差分 20261001-t2-error-codes の受入テスト — 上限（50 MB）を超えるファイル
 *
 * 期待値の正本: specs/changes/20261001-t2-error-codes/specs/{common_errors,get_attachment,get_law_file}/spec.md
 * e-Gov の /attachment・/law_file の応答は fetch の差し替えで返す。本文を読んだかどうかは、
 * ReadableStream の pull が呼ばれたかで確かめる。
 */

import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
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

const LIMIT = 52_428_800;

/** Content-Length を付けた（または付けない）応答。本文を読み始めたら pulled.value が true になる */
function binary(
  size: number,
  contentLength: number | null
): { response: Response; pulled: { value: boolean } } {
  const pulled = { value: false };
  let sent = 0;
  const chunk = new Uint8Array(1024 * 1024);
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulled.value = true;
        if (sent >= size) {
          controller.close();
          return;
        }
        const n = Math.min(chunk.length, size - sent);
        controller.enqueue(chunk.subarray(0, n));
        sent += n;
      },
    },
    // 先読みさせない（読み始めたときだけ pull が呼ばれるように）
    { highWaterMark: 0 }
  );
  const headers: Record<string, string> = { 'content-type': 'application/octet-stream' };
  if (contentLength !== null) headers['content-length'] = String(contentLength);
  return { response: new Response(body, { status: 200, headers }), pulled };
}

describe('FILE_TOO_LARGE (20261001-t2-error-codes)', () => {
  let h: Harness;
  let dir: string;
  let savedDir: string | undefined;
  let next: { response: Response; pulled: { value: boolean } } | null;

  beforeEach(async () => {
    savedDir = process.env.HOUKI_EGOV_FILES_DIR;
    dir = mkdtempSync(join(tmpdir(), 'houki-egov-t2-files-'));
    process.env.HOUKI_EGOV_FILES_DIR = dir;
    next = null;
    h = await startHarness((url) => {
      if (url.pathname.includes('/law_data/')) {
        return lawDataResponse(MINPO, simpleLawTree('民法'), ['./pict/big.pdf']);
      }
      if (url.pathname.includes('/attachment/') || url.pathname.includes('/law_file/')) {
        return next?.response ?? null;
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

  const savedFiles = () =>
    existsSync(dir)
      ? readdirSync(dir, { recursive: true }).filter((f) => String(f).includes('.'))
      : [];

  it('SPEC-EGOV-COMMON-ERRORS-030 上限を超えるファイルは FILE_TOO_LARGE（INVALID_ARGUMENT ではない）で、detail に url と bytes', async () => {
    next = binary(10, LIMIT + 1);
    const r = await h.call('get_attachment', {
      law_name: '民法',
      src: './pict/big.pdf',
      save: true,
    });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('FILE_TOO_LARGE');
    expect(r.body.code).not.toBe('INVALID_ARGUMENT');
    expect(r.body.retryable).toBe(false);
    expect(r.body.hint).toBe('保存せず url をそのまま使ってください');
    expect(r.body.detail.bytes).toBe(LIMIT + 1);
    expect(typeof r.body.detail.url).toBe('string');
    expect(savedFiles()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-027 Content-Length が上限を超えていれば本文を読まずに FILE_TOO_LARGE', async () => {
    next = binary(10, LIMIT + 1);
    const r = await h.call('get_attachment', {
      law_name: '民法',
      src: './pict/big.pdf',
      save: true,
    });
    expect(r.body.code).toBe('FILE_TOO_LARGE');
    expect(r.body.retryable).toBe(false);
    expect(r.body.detail.bytes).toBe(52428801);
    expect(r.body.error).toBe('ファイルが大きすぎます: 50.0 MB（上限 50.0 MB）');
    expect(next.pulled.value).toBe(false);
    expect(savedFiles()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-027 Content-Length が無く本文が上限を超えていれば、読み終えた大きさで FILE_TOO_LARGE', async () => {
    next = binary(LIMIT + 1, null);
    const r = await h.call('get_attachment', {
      law_name: '民法',
      src: './pict/big.pdf',
      save: true,
    });
    expect(r.body.code).toBe('FILE_TOO_LARGE');
    expect(r.body.detail.bytes).toBe(LIMIT + 1);
    expect(savedFiles()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-027 Content-Length がちょうど 50 MB なら保存する', async () => {
    next = binary(LIMIT, LIMIT);
    const r = await h.call('get_attachment', {
      law_name: '民法',
      src: './pict/big.pdf',
      save: true,
    });
    expect(r.isError).toBe(false);
    expect(r.body.saved.bytes).toBe(LIMIT);
  });

  it('SPEC-EGOV-GET-LAW-FILE-021 Content-Length が上限を超えていれば本文を読まずに FILE_TOO_LARGE（detail.url は asof 付き）', async () => {
    next = binary(10, LIMIT + 1);
    const r = await h.call('get_law_file', {
      law_name: '民法',
      file_type: 'xml',
      save: true,
      at: '2024-04-01',
    });
    expect(r.body.code).toBe('FILE_TOO_LARGE');
    expect(r.body.retryable).toBe(false);
    expect(r.body.detail.bytes).toBe(52428801);
    expect(r.body.detail.url).toContain('asof=2024-04-01');
    expect(r.body.hint).toBe('保存せず url をそのまま使ってください');
    expect(next.pulled.value).toBe(false);
    expect(savedFiles()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-LAW-FILE-021 Content-Length が無く本文が上限を超えていれば FILE_TOO_LARGE、ちょうど 50 MB なら保存する', async () => {
    next = binary(LIMIT + 1, null);
    const a = await h.call('get_law_file', { law_name: '民法', file_type: 'xml', save: true });
    expect(a.body.code).toBe('FILE_TOO_LARGE');
    expect(a.body.detail.bytes).toBe(LIMIT + 1);
    next = binary(LIMIT, LIMIT);
    const b = await h.call('get_law_file', { law_name: '民法', file_type: 'xml', save: true });
    expect(b.isError).toBe(false);
    expect(b.body.saved.bytes).toBe(LIMIT);
  });
});
