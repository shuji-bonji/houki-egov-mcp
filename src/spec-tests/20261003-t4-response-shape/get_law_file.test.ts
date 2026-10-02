/**
 * 差分 20261003-t4-response-shape の受入テスト — get_law_file の saved.law_revision_id と Content-Disposition
 *
 * 期待値の正本: specs/changes/20261003-t4-response-shape/specs/get_law_file/spec.md
 * /law_file の応答の Content-Disposition をテストごとに変える（null はヘッダーを付けない）。
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseContentDispositionFileName } from '../../services/egov-client.js';
import { type Harness, MINPO, startHarness } from '../../test-helpers/mcp-harness.js';

const REV = '129AC0000000089_20260624_508AC0000000045';

describe('get_law_file の保存（20261003-t4-response-shape）', () => {
  let h: Harness;
  let disposition: string | null;
  let dir: string;
  let savedDir: string | undefined;

  beforeEach(async () => {
    savedDir = process.env.HOUKI_EGOV_FILES_DIR;
    dir = mkdtempSync(join(tmpdir(), 'houki-egov-t4-file-'));
    process.env.HOUKI_EGOV_FILES_DIR = dir;
    disposition = null;
    h = await startHarness((url) => {
      if (url.pathname.includes('/law_file/')) {
        const headers: Record<string, string> = { 'content-type': 'application/octet-stream' };
        if (disposition !== null) headers['content-disposition'] = disposition;
        return new Response(new TextEncoder().encode('<Law/>'), { status: 200, headers });
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

  async function save(fileType = 'xml') {
    const r = await h.call('get_law_file', { law_name: '民法', file_type: fileType, save: true });
    if (r.isError) throw new Error(r.text);
    return r.body;
  }

  it('SPEC-EGOV-GET-LAW-FILE-003 Content-Disposition が無いと file_name も law_revision_id も null で、<law_id>/<law_id>.<file_type> に保存する', async () => {
    const r = await save('xml');
    expect(r.saved.file_name).toBeNull();
    expect(Object.hasOwn(r.saved, 'law_revision_id')).toBe(true);
    expect(r.saved.law_revision_id).toBeNull();
    const path = join(dir, MINPO.law_id, `${MINPO.law_id}.xml`);
    expect(r.saved.path).toBe(path);
    expect(existsSync(path)).toBe(true);
  });

  it('SPEC-EGOV-GET-LAW-FILE-003 filename を含まない Content-Disposition（inline）も読めないときと同じ', async () => {
    disposition = 'inline';
    const r = await save('docx');
    expect(r.saved.file_name).toBeNull();
    expect(r.saved.law_revision_id).toBeNull();
    expect(r.saved.path).toBe(join(dir, MINPO.law_id, `${MINPO.law_id}.docx`));
  });

  it('SPEC-EGOV-GET-LAW-FILE-003 ファイル名が <law_revision_id>.<拡張子> の形でなければ law_revision_id は null で、<law_id> のディレクトリに保存する', async () => {
    disposition = 'attachment; filename="notes-v2.xml"';
    const r = await save('xml');
    expect(r.saved.file_name).toBe('notes-v2.xml');
    expect(r.saved.law_revision_id).toBeNull();
    expect(r.saved.path).toBe(join(dir, MINPO.law_id, 'notes-v2.xml'));
  });

  it('SPEC-EGOV-GET-LAW-FILE-003 <law_revision_id>.<拡張子> の形なら、その履歴 ID を返し、そのディレクトリに保存する', async () => {
    disposition = `attachment; filename="${REV}.docx"`;
    const r = await save('docx');
    expect(r.saved.file_name).toBe(`${REV}.docx`);
    expect(r.saved.law_revision_id).toBe(REV);
    expect(r.saved.path).toBe(join(dir, REV, `${REV}.docx`));
    expect(r.meta.at).toBeNull();
  });

  it('SPEC-EGOV-GET-LAW-FILE-004 filename と filename* の両方があれば、順によらず filename* を使う', async () => {
    disposition = `attachment; filename="a.xml"; filename*=UTF-8''${REV}.xml`;
    const first = await save('xml');
    expect(first.saved.file_name).toBe(`${REV}.xml`);
    expect(first.saved.law_revision_id).toBe(REV);
    disposition = `attachment; filename*=UTF-8''${REV}.xml; filename="a.xml"`;
    const second = await save('xml');
    expect(second.saved.file_name).toBe(`${REV}.xml`);
  });
});

describe('Content-Disposition のファイル名の読み方（20261003-t4-response-shape）', () => {
  it('SPEC-EGOV-GET-LAW-FILE-004 filename* を先に探し、URL デコードする（ヘッダーの中の順によらない）', () => {
    expect(
      parseContentDispositionFileName(`attachment; filename="a.xml"; filename*=UTF-8''b%20c.xml`)
    ).toBe('b c.xml');
    expect(
      parseContentDispositionFileName(`attachment; filename*=UTF-8''b%20c.xml; filename="a.xml"`)
    ).toBe('b c.xml');
  });

  it('SPEC-EGOV-GET-LAW-FILE-004 filename* が無ければ filename（引用符の有無によらない）、どちらも無ければ null', () => {
    expect(parseContentDispositionFileName('attachment; filename="a.xml"')).toBe('a.xml');
    expect(parseContentDispositionFileName('attachment; filename=a.xml')).toBe('a.xml');
    expect(parseContentDispositionFileName('inline')).toBeNull();
    expect(parseContentDispositionFileName(null)).toBeNull();
  });
});
