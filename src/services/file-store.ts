/**
 * `get_attachment` / `get_law_file` の `save: true` が書くファイルの置き場所（#19、v0.15.0）。
 *
 * 保存先はサーバー側で決める。ツールの引数にパスを持たせないのは、LLM が渡した文字列を
 * そのままファイルシステムのパスに使わないため。上書きは `HOUKI_EGOV_FILES_DIR` だけ。
 *
 * 置き場所: `${HOUKI_EGOV_FILES_DIR:-${XDG_CACHE_HOME:-~/.cache}/houki-egov-mcp/files}/<law_revision_id>/<ファイル名>`
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { FILES_CONFIG } from '../config.js';

/** 保存先のルート。環境変数は呼ぶたびに読む（テストで差し替えられるように） */
export function defaultFilesDir(): string {
  const override = process.env[FILES_CONFIG.dirEnv];
  if (override && override.length > 0) return resolve(override);
  const xdg = process.env.XDG_CACHE_HOME;
  const cacheRoot = xdg && xdg.length > 0 ? xdg : resolve(homedir(), '.cache');
  return resolve(cacheRoot, 'houki-egov-mcp', 'files');
}

/**
 * ファイル名に使えない文字を落とす。パス区切り・親ディレクトリ参照は残さない。
 * e-Gov の src は "./pict/H11HO127-001.jpg" の形なので、basename を採る。
 */
export function safeFileName(name: string): string {
  const base = basename(name.replace(/\\/g, '/'));
  const cleaned = base.replace(/[^\w.\-぀-ヿ一-鿿]/g, '_').replace(/^\.+/, '');
  return cleaned.length > 0 ? cleaned : 'file';
}

/** `<root>/<subdir>/<name>` に書き、書いた絶対パスを返す。subdir も 1 階層のディレクトリ名に丸める */
export function saveFile(
  subdir: string,
  name: string,
  bytes: Uint8Array,
  opts: { root?: string } = {}
): string {
  const root = opts.root ?? defaultFilesDir();
  const dir = resolve(root, safeFileName(subdir));
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, safeFileName(name));
  writeFileSync(path, bytes);
  return path;
}
