import { describe, expect, it } from 'vitest';
import { parseContentDispositionFileName } from './egov-client.js';
import { safeFileName } from './file-store.js';

describe('safeFileName', () => {
  it('src のパスは末尾のファイル名だけにし、親ディレクトリ参照を残さない', () => {
    expect(safeFileName('./pict/H11HO127-001.jpg')).toBe('H11HO127-001.jpg');
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('..\\..\\x.pdf')).toBe('x.pdf');
    expect(safeFileName('...')).toBe('file');
    expect(safeFileName('a b/c:d.pdf')).toBe('c_d.pdf');
  });
});

describe('parseContentDispositionFileName', () => {
  it('e-Gov の attachment; filename="…" を読む', () => {
    expect(
      parseContentDispositionFileName(
        'attachment; filename="129AC0000000089_20260624_508AC0000000045.docx"'
      )
    ).toBe('129AC0000000089_20260624_508AC0000000045.docx');
    expect(parseContentDispositionFileName("attachment; filename*=UTF-8''a%20b.pdf")).toBe(
      'a b.pdf'
    );
    expect(parseContentDispositionFileName(null)).toBeNull();
    expect(parseContentDispositionFileName('inline')).toBeNull();
  });
});
