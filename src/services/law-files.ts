/**
 * 添付ファイルと法令本文ファイル（egov#19、v0.15.0）
 *
 * - `list_attachments`: /law_data の attached_files_info と本文の Fig 要素を src で突き合わせ、
 *   各ファイルの URL と「別表第一（第一条関係）」のような位置を返す
 * - `get_attachment`: 添付 1 件（src 省略で zip）。既定は URL とメタ情報だけ、`save: true` で保存
 * - `get_law_file`: 法令本文を xml / json / html / rtf / docx で。既定は URL、`save: true` で保存
 *
 * バイナリの中身は応答に入れない（base64 は返さない）。URL は認証なしで開ける直リンクで、
 * pdf-reader-mcp の read_url にそのまま渡せる。保存先はサーバー側で決める（file-store.ts）。
 */

import { EGOV_API, FILES_CONFIG } from '../config.js';
import type { LawFileType } from '../constants.js';
import { LAW_FILE_TYPES } from '../constants.js';
import { type LawServiceError, makeError, NEXT_ACTIONS, type NextAction } from '../errors.js';
import {
  type AttachedFile,
  type EgovBinaryResponse,
  EgovHttpError,
  getAttachment as fetchAttachment,
  getLawFile as fetchLawFile,
} from './egov-client.js';
import { defaultFilesDir, saveFile } from './file-store.js';
import {
  type ArticleMeta,
  checkAbbreviationScope,
  egovHttpErrorToLawError,
  fetchLawData,
  type LawServiceResult,
  resolveLawId,
} from './law-service.js';
import { extractFigures, type FigureLocation } from './law-tree.js';

/** 添付ファイル 1 件 */
export interface AttachmentEntry {
  /** Fig 要素の src 属性。get_attachment の src にそのまま渡す。例 "./pict/H11HO127-001.jpg" */
  src: string;
  /** src の末尾のファイル名。例 "H11HO127-001.jpg" */
  file_name: string;
  /** 拡張子から決めた種別。e-Gov の添付は jpg と pdf */
  file_type: string;
  /** 拡張子から決めた Content-Type */
  content_type: string;
  /** 認証なしで開ける取得 URL（/attachment/{law_revision_id}?src=…） */
  url: string;
  /** 正誤等による更新日時（attached_files_info の updated）。本文にだけあって一覧に無いファイルでは付かない */
  updated?: string;
  /**
   * 法令の中の置き場所（別表・様式・条）。attached_files_info にだけあって本文の Fig に無いファイルでは null
   */
  location: FigureLocation | null;
}

/** list_attachments の meta。ArticleMeta に法令履歴 ID を足したもの */
export interface AttachmentMeta extends ArticleMeta {
  /** 添付ファイルが属する法令履歴 ID。/attachment のパスに使う */
  law_revision_id: string;
}

export interface ListAttachmentsResponse {
  meta: AttachmentMeta;
  count: number;
  attachments: AttachmentEntry[];
  /** 添付ファイルをまとめた zip の URL。添付が無い法令では null */
  zip_url: string | null;
  note: string;
  next_actions?: NextAction[];
}

/** 添付ファイルの取得結果。save の有無で形が変わる */
export interface GetAttachmentResponse {
  meta: AttachmentMeta;
  /** 1 件（src 指定）か、まとめた zip（src 省略）か */
  kind: 'file' | 'zip';
  src: string | null;
  file_name: string;
  file_type: string;
  content_type: string;
  url: string;
  updated?: string;
  location: FigureLocation | null;
  /** save: true のときだけ。書いた絶対パスとサイズ。response_content_type は e-Gov の応答ヘッダー（pdf は application/octet-stream で返る） */
  saved?: { path: string; bytes: number; response_content_type: string | null };
  note: string;
  next_actions?: NextAction[];
}

export interface GetLawFileResponse {
  meta: ArticleMeta;
  file_type: LawFileType;
  content_type: string;
  url: string;
  saved?: {
    path: string;
    bytes: number;
    /** e-Gov の Content-Disposition のファイル名。"<law_revision_id>.docx" の形で、どの履歴の本文かが分かる */
    file_name: string | null;
    law_revision_id: string | null;
  };
  note: string;
  next_actions?: NextAction[];
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  pdf: 'application/pdf',
  zip: 'application/zip',
  xml: 'application/xml',
  json: 'application/json',
  html: 'text/html',
  rtf: 'application/rtf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function fileTypeOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

function contentTypeOf(fileType: string): string {
  return CONTENT_TYPES[fileType] ?? 'application/octet-stream';
}

function fileNameOf(src: string): string {
  const parts = src.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || src;
}

/** LAW_NOT_FOUND の共通形（law-service.ts の getLawArticle と同じ） */
function lawNotFound(lawName: string): LawServiceError {
  return makeError('LAW_NOT_FOUND', `法令が見つかりません: ${lawName}`, {
    hint: '略称辞書 / e-Gov 法令検索で該当なし。表記を確認してください',
    next_actions: [NEXT_ACTIONS.resolveAbbreviation(lawName), NEXT_ACTIONS.searchLaw(lawName)],
  });
}

/**
 * 法令名 → law_id → /law_data。添付の一覧はここで作る。
 * 返り値の entries は、attached_files_info の並びを先に、本文にだけある Fig を後に置く。
 */
async function loadAttachments(opts: {
  law_name: string;
  at?: string;
}): Promise<LawServiceResult<{ meta: AttachmentMeta; entries: AttachmentEntry[] }>> {
  const scopeError = checkAbbreviationScope(opts.law_name);
  if (scopeError) return scopeError;

  const resolved = await resolveLawId(opts.law_name);
  if (!resolved) return lawNotFound(opts.law_name);

  let lawData: Awaited<ReturnType<typeof fetchLawData>>;
  try {
    lawData = await fetchLawData(resolved.law_id, opts.at);
  } catch (err) {
    return egovHttpErrorToLawError(err);
  }

  const revisionId = lawData.revision_info?.law_revision_id;
  if (!revisionId) {
    return makeError('SOURCE_API_ERROR', 'e-Gov の応答に law_revision_id がありません', {
      hint: '添付ファイルの取得には法令履歴 ID が要ります。e-Gov 側の応答形式が変わった可能性があります',
      retryable: false,
      detail: { url: EGOV_API.lawData(resolved.law_id) },
    });
  }

  const listed: AttachedFile[] = lawData.attached_files_info?.attached_files ?? [];
  const figures = extractFigures(lawData.law_full_text);
  const locationBySrc = new Map<string, FigureLocation>();
  for (const f of figures) {
    if (!locationBySrc.has(f.src)) locationBySrc.set(f.src, f.location);
  }

  const entries: AttachmentEntry[] = [];
  const seen = new Set<string>();
  for (const a of listed) {
    if (!a.src || seen.has(a.src)) continue;
    seen.add(a.src);
    entries.push(toEntry(revisionId, a.src, a.updated, locationBySrc.get(a.src) ?? null));
  }
  for (const f of figures) {
    if (seen.has(f.src)) continue;
    seen.add(f.src);
    entries.push(toEntry(revisionId, f.src, undefined, f.location));
  }

  const meta: AttachmentMeta = {
    law_id: resolved.law_id,
    title: resolved.title,
    law_num: resolved.law_num,
    law_revision_id: revisionId,
    retrieved_at: new Date().toISOString(),
    url: EGOV_API.publicLawUrl(resolved.law_id),
    ...(opts.at ? { at: opts.at } : {}),
  };
  return { meta, entries };
}

function toEntry(
  revisionId: string,
  src: string,
  updated: string | undefined,
  location: FigureLocation | null
): AttachmentEntry {
  const fileName = fileNameOf(src);
  const fileType = fileTypeOf(fileName);
  const entry: AttachmentEntry = {
    src,
    file_name: fileName,
    file_type: fileType,
    content_type: contentTypeOf(fileType),
    url: EGOV_API.attachment(revisionId, src),
    location,
  };
  if (updated) entry.updated = updated;
  return entry;
}

/** 添付ファイルの取得を勧める next_actions。pdf は pdf-reader-mcp の read_url に URL を渡せる */
function attachmentNextActions(lawName: string, entries: AttachmentEntry[]): NextAction[] {
  const actions: NextAction[] = [];
  const first = entries[0];
  if (first) {
    actions.push({
      action: 'get_attachment',
      reason:
        '1 件を保存するときは save: true を付ける（保存しないなら一覧の url をそのまま使えます）',
      example: { law_name: lawName, src: first.src, save: true },
    });
  }
  const pdf = entries.find((e) => e.file_type === 'pdf');
  if (pdf) {
    actions.push({
      action: 'pdf-reader-mcp:read_url',
      reason: 'pdf の添付は pdf-reader-mcp の read_url に url を渡すと本文を読めます',
      example: { url: pdf.url },
    });
  }
  return actions;
}

/**
 * list_attachments — 法令の添付ファイル一覧
 */
export async function listAttachments(opts: {
  law_name: string;
  at?: string;
}): Promise<LawServiceResult<ListAttachmentsResponse>> {
  const loaded = await loadAttachments(opts);
  if ('error' in loaded) return loaded;
  const { meta, entries } = loaded;

  const byType = new Map<string, number>();
  for (const e of entries)
    byType.set(e.file_type || '?', (byType.get(e.file_type || '?') ?? 0) + 1);
  const typeSummary = [...byType.entries()].map(([t, n]) => `${t} ${n} 件`).join('、');
  const withoutLocation = entries.filter((e) => e.location === null).length;

  let note: string;
  if (entries.length === 0) {
    note = `${meta.title} の法令履歴 ${meta.law_revision_id} に添付ファイルはありません（attached_files_info が空で、本文に Fig 要素も無い）。`;
  } else {
    note = `${meta.title} の添付ファイル ${entries.length} 件（${typeSummary}）。url は認証なしで開けます。`;
    if (withoutLocation > 0) {
      note += ` ${withoutLocation} 件は attached_files_info にあるが本文の Fig 要素に見つからず、location は null です。`;
    }
  }

  const res: ListAttachmentsResponse = {
    meta,
    count: entries.length,
    attachments: entries,
    zip_url: entries.length > 0 ? EGOV_API.attachment(meta.law_revision_id) : null,
    note,
  };
  const actions = attachmentNextActions(opts.law_name, entries);
  if (actions.length > 0) res.next_actions = actions;
  return res;
}

/**
 * get_attachment — 添付ファイル 1 件（src 省略で zip）
 *
 * `save` が false のときは e-Gov の /attachment を呼ばず、URL と位置だけを返す（/law_data は引く）。
 */
export async function getAttachment(opts: {
  law_name: string;
  src?: string;
  at?: string;
  save?: boolean;
}): Promise<LawServiceResult<GetAttachmentResponse>> {
  const loaded = await loadAttachments(opts);
  if ('error' in loaded) return loaded;
  const { meta, entries } = loaded;

  if (entries.length === 0) {
    return makeError(
      'ATTACHMENT_NOT_FOUND',
      `${meta.title} の法令履歴 ${meta.law_revision_id} に添付ファイルはありません`,
      {
        hint: 'attached_files_info が空で、本文に Fig 要素もありません。別の時点（at）の履歴には付いていることがあります',
        next_actions: [
          {
            action: 'get_law_revisions',
            reason: '改正履歴から別の時点を選び、at を付けて呼び直せます',
            example: { law_name: opts.law_name },
          },
        ],
      }
    );
  }

  let entry: AttachmentEntry | null = null;
  let kind: 'file' | 'zip' = 'zip';
  if (opts.src !== undefined && opts.src !== '') {
    const wanted = opts.src.trim();
    entry =
      entries.find((e) => e.src === wanted) ??
      entries.find((e) => e.file_name === fileNameOf(wanted)) ??
      null;
    if (!entry) {
      return makeError(
        'ATTACHMENT_NOT_FOUND',
        `添付ファイルが見つかりません: ${wanted}（${meta.title}、履歴 ${meta.law_revision_id}）`,
        {
          hint: `この履歴の添付ファイル ${entries.length} 件: ${entries
            .slice(0, 10)
            .map((e) => e.src)
            .join(', ')}${entries.length > 10 ? ', …' : ''}`,
          next_actions: [
            {
              action: 'list_attachments',
              reason: '添付ファイルの一覧から src を選び直せます',
              example: { law_name: opts.law_name, ...(opts.at ? { at: opts.at } : {}) },
            },
          ],
        }
      );
    }
    kind = 'file';
  }

  const url = kind === 'file' && entry ? entry.url : EGOV_API.attachment(meta.law_revision_id);
  const fileName = kind === 'file' && entry ? entry.file_name : `${meta.law_revision_id}.zip`;
  const fileType = kind === 'file' && entry ? entry.file_type : 'zip';

  const res: GetAttachmentResponse = {
    meta,
    kind,
    src: entry?.src ?? null,
    file_name: fileName,
    file_type: fileType,
    content_type: contentTypeOf(fileType),
    url,
    location: entry?.location ?? null,
    note: '',
  };
  if (entry?.updated) res.updated = entry.updated;

  if (!opts.save) {
    res.note =
      kind === 'file'
        ? `${fileName} の URL です。認証なしで開けます。ファイルをディスクに置くには save: true を付けてください（${defaultFilesDir()} 以下に保存します）。`
        : `添付ファイル ${entries.length} 件をまとめた zip の URL です。ファイルをディスクに置くには save: true を付けてください。`;
    if (fileType === 'pdf') {
      res.next_actions = [
        {
          action: 'pdf-reader-mcp:read_url',
          reason: 'pdf の本文を読むには pdf-reader-mcp の read_url に url を渡します',
          example: { url },
        },
      ];
    }
    return res;
  }

  let bin: EgovBinaryResponse;
  try {
    bin = await fetchAttachment(meta.law_revision_id, entry?.src);
  } catch (err) {
    return attachmentErrorToLawError(err, meta, opts);
  }
  const sizeError = checkSize(bin, url);
  if (sizeError) return sizeError;

  const path = saveFile(meta.law_revision_id, fileName, bin.bytes);
  res.saved = { path, bytes: bin.bytes.length, response_content_type: bin.contentType };
  res.note = `${fileName}（${formatBytes(bin.bytes.length)}）を ${path} に保存しました。`;
  if (fileType === 'pdf') {
    res.next_actions = [
      {
        action: 'pdf-reader-mcp:read_text',
        reason: '保存した pdf は pdf-reader-mcp で読めます',
        example: { path },
      },
    ];
  }
  return res;
}

/**
 * get_law_file — 法令本文ファイル（xml / json / html / rtf / docx）
 *
 * URL は law_id と時点（asof）で組む。/law_data を引かないので `save: false` なら e-Gov への
 * 問い合わせは法令名の解決だけ。保存したときは Content-Disposition のファイル名から履歴 ID が分かる。
 */
export async function getLawFile(opts: {
  law_name: string;
  file_type: string;
  at?: string;
  save?: boolean;
}): Promise<LawServiceResult<GetLawFileResponse>> {
  if (!(LAW_FILE_TYPES as readonly string[]).includes(opts.file_type)) {
    return makeError('INVALID_ARGUMENT', `file_type が不正です: ${opts.file_type}`, {
      hint: `file_type は ${LAW_FILE_TYPES.join(' / ')} のいずれかです`,
    });
  }
  const fileType = opts.file_type as LawFileType;

  const scopeError = checkAbbreviationScope(opts.law_name);
  if (scopeError) return scopeError;
  const resolved = await resolveLawId(opts.law_name);
  if (!resolved) return lawNotFound(opts.law_name);

  const url = EGOV_API.lawFile(fileType, resolved.law_id, opts.at);
  const meta: ArticleMeta = {
    law_id: resolved.law_id,
    title: resolved.title,
    law_num: resolved.law_num,
    retrieved_at: new Date().toISOString(),
    url: EGOV_API.publicLawUrl(resolved.law_id),
    ...(opts.at ? { at: opts.at } : {}),
  };
  const res: GetLawFileResponse = {
    meta,
    file_type: fileType,
    content_type: contentTypeOf(fileType),
    url,
    note: '',
  };

  if (!opts.save) {
    res.note = `${resolved.title} の本文を ${fileType} で取る URL です。認証なしで開けます${
      opts.at ? `（時点 ${opts.at} 以前で最新の履歴）` : '（現時点で最新の履歴）'
    }。ファイルをディスクに置くには save: true を付けてください（${defaultFilesDir()} 以下に保存します）。`;
    const actions = lawFileNextActions(opts.law_name, fileType);
    if (actions.length > 0) res.next_actions = actions;
    return res;
  }

  let bin: EgovBinaryResponse;
  try {
    bin = await fetchLawFile(fileType, resolved.law_id, opts.at);
  } catch (err) {
    return egovHttpErrorToLawError(err);
  }
  const sizeError = checkSize(bin, url);
  if (sizeError) return sizeError;

  const fileName = bin.fileName ?? `${resolved.law_id}.${fileType}`;
  const revisionId = /^([0-9A-Za-z_]+)\.[A-Za-z0-9]+$/.exec(fileName)?.[1] ?? null;
  const path = saveFile(revisionId ?? resolved.law_id, fileName, bin.bytes);
  res.saved = {
    path,
    bytes: bin.bytes.length,
    file_name: bin.fileName,
    law_revision_id: revisionId,
  };
  res.note = `${fileName}（${formatBytes(bin.bytes.length)}）を ${path} に保存しました。`;
  const actions = lawFileNextActions(opts.law_name, fileType);
  if (actions.length > 0) res.next_actions = actions;
  return res;
}

function lawFileNextActions(lawName: string, fileType: LawFileType): NextAction[] {
  const actions: NextAction[] = [];
  if (fileType === 'xml' || fileType === 'json') {
    actions.push({
      action: 'get_law',
      reason:
        'xml / json は法令全体（民法で 1.6 MB）です。条文を読むだけなら get_law / get_law_range のほうが小さく済みます',
      example: { law_name: lawName, article: '1' },
    });
  }
  return actions;
}

/** /attachment のエラーを family の code にする。e-Gov の 404003 は ATTACHMENT_NOT_FOUND */
function attachmentErrorToLawError(
  err: unknown,
  meta: AttachmentMeta,
  opts: { law_name: string; src?: string; at?: string }
): LawServiceError {
  if (err instanceof EgovHttpError && (err.status === 400 || err.status === 404)) {
    const code = err.egovErrorCode();
    if (code === '404003') {
      return makeError(
        'ATTACHMENT_NOT_FOUND',
        `e-Gov に添付ファイルがありません: ${opts.src ?? '(zip)'}（${meta.title}、履歴 ${meta.law_revision_id}）`,
        {
          hint: 'attached_files_info には載っているが e-Gov の /attachment が 404003 を返しました。e-Gov 側の収録漏れの可能性があります',
          next_actions: [NEXT_ACTIONS.visitEgovSite(meta.law_id)],
          detail: { status: err.status, url: err.url, cause: err.body },
        }
      );
    }
    return makeError('SOURCE_API_ERROR', `e-Gov API error: ${err.message}`, {
      retryable: false,
      detail: { status: err.status, url: err.url, cause: err.body },
    });
  }
  return egovHttpErrorToLawError(err);
}

function checkSize(bin: EgovBinaryResponse, url: string): LawServiceError | null {
  if (bin.bytes.length <= FILES_CONFIG.maxBytes) return null;
  return makeError(
    'INVALID_ARGUMENT',
    `ファイルが大きすぎます: ${formatBytes(bin.bytes.length)}（上限 ${formatBytes(FILES_CONFIG.maxBytes)}）`,
    {
      hint: '保存せず url をそのまま使ってください',
      detail: { url },
    }
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
