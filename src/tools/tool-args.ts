/**
 * ツールの引数の型を inputSchema から導き、tools/call の受け口を unknown にする仕組み。
 *
 * MCP の tools/call は、ツール名を文字列で、引数を JSON で受け取る。コードの外から来る値なので、
 * 受け口の型は unknown にし、inputSchema で検証してから型を付ける。
 *
 * - 引数の型は `json-schema-to-ts` の `FromSchema` で inputSchema から導く（手書きの型と
 *   inputSchema がずれないようにする）
 * - 検証は `input-validator.ts` の `validateInput`（同じ inputSchema を読む）。検証を通った値にだけ型を当てる
 * - inputSchema で書けない検査（空白だけの必須の文字列・暦に無い日付）は、検証の後、handler の前に行う
 *   （SPEC-EGOV-COMMON-ERRORS-024・026）
 * - 型を当てる箇所は `bindTool()` の中の 1 か所だけ
 *
 * v0.5.3〜v0.5.4 は server.ts の validateArgs() で検証し、handler 表は `(args: any) => …` だった。
 * v0.6.0〜v0.15.4 は SDK の `fromJsonSchema`（ajv）で検証していた。
 */

import type { Tool } from '@modelcontextprotocol/server';
import type { FromSchema, JSONSchema } from 'json-schema-to-ts';
import { type LawServiceError, makeError } from '../errors.js';
import {
  assertSupportedSchema,
  type InputIssue,
  isCalendarDate,
  validateInput,
} from './input-validator.js';

/**
 * inputSchema から導いた引数の型。
 * `default` を持つ引数も省略可能のままにする（検証は default を埋めないため、handler 側で既定値を補う）。
 */
export type ArgsOf<S extends JSONSchema> = FromSchema<S, { keepDefaultedPropertiesOptional: true }>;

/** tools/call の受け口。引数はコードの外から来る JSON なので unknown で受ける */
export type ToolHandler = (args: unknown) => Promise<unknown>;

/** 1 つのツールの定義。inputSchema は型を導くため `as const` で書く */
export interface ToolSpec<S extends JSONSchema = JSONSchema> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: S;
}

/**
 * tools/list に出す形にする。
 *
 * `as const` の inputSchema は readonly の配列（`required` / `enum`）を持つので、SDK の `Tool` 型
 * （書き換え可能な配列）にはそのまま代入できない。値は同じ JSON なので、ここでだけ型を当てる。
 */
export function toMcpTool(spec: ToolSpec): Tool {
  return {
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema as unknown as Tool['inputSchema'],
  };
}

/**
 * ツールの定義と handler をつなぎ、引数を検証してから handler に渡す受け口を作る。
 * 検証に失敗したら family error contract の INVALID_ARGUMENT を返す（handler は呼ばない）。
 */
export function bindTool<T extends ToolSpec>(
  spec: T,
  handler: (args: NoInfer<ArgsOf<T['inputSchema']>>) => Promise<unknown>
): ToolHandler {
  const schema = spec.inputSchema as unknown as Record<string, unknown>;
  // 対応していないキーワードがあれば、検査を素通りさせないよう起動時に止める
  assertSupportedSchema(schema, `${spec.name}.inputSchema`);
  // 同じ inputSchema で検証した値だけを handler に渡すので、handler の引数の型
  // （inputSchema から導いた ArgsOf）は成り立つ。関数の中で ArgsOf<T['inputSchema']> を式に書くと、
  // 型引数 T のまま FromSchema を展開しようとして TS2589（型の展開が深すぎる）になるため、
  // 呼び出しの型だけを unknown で受ける形に置き換える
  const call = handler as unknown as ToolHandler;
  return async (raw) => {
    const args = raw ?? {};
    const issues = validateInput(schema, args);
    if (issues.length > 0) return invalidArgument(spec.name, issues);
    const guard = checkBeyondSchema(spec.name, schema, args as Record<string, unknown>);
    if (guard) return guard;
    return call(args);
  };
}

/** inputSchema の検査の問題を INVALID_ARGUMENT の LawServiceError にする（SPEC-EGOV-COMMON-ERRORS-013・014・020） */
function invalidArgument(name: string, issues: InputIssue[]): LawServiceError {
  return makeError(
    'INVALID_ARGUMENT',
    `引数が tools/list の inputSchema に合いません: ${issues.map((d) => `${d.path}: ${d.message}`).join('; ')}`,
    {
      tool: name,
      hint: `tools/list の ${name} の inputSchema を確認してください (型・必須・enum・範囲・形式・未知の引数)`,
      next_actions: [
        { action: 'list_tools', reason: 'inputSchema で引数の型と必須項目を確認できます' },
      ],
      detail: { issues },
    }
  );
}

// ========================================
// inputSchema で書けない検査（SPEC-EGOV-COMMON-ERRORS-024・026）
// ========================================

/** 空白だけの必須の文字列に付ける hint（引数名ごと。ツールで変えるものはツール名を前に付けたキー） */
const BLANK_HINTS: Record<string, string> = {
  'search_law.keyword':
    '検索したい法令名・略称・キーワード（例: "消費税", "労基"）を指定してください',
  'search_fulltext.keyword':
    '探したい語や法令名（例: "民法 不法行為", "適格請求書"）を指定してください',
  law_name: '法令名か略称（例: "民法", "消法"）を指定してください',
  abbr: '略称・正式名称・別名（例: "消法", "所得税法"）を指定してください',
  name: '法令種別の名前・別名・法令種別コード（例: "政令", "施行令", "Act"）を指定してください',
  article: '条番号（例: "30", "57の2"）を指定してください',
};

const AT_HINT = 'at には暦にある日付を YYYY-MM-DD の形で指定してください（例: "2024-04-01"）';

/** 空白だけを調べる引数（必須で minLength: 1 の文字列）を、inputSchema から引数名の並びで集める */
function blankTargets(schema: Record<string, unknown>): string[] {
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = (schema.required ?? []) as string[];
  return Object.keys(properties).filter(
    (name) =>
      required.includes(name) &&
      properties[name].type === 'string' &&
      properties[name].minLength === 1
  );
}

/**
 * inputSchema の検査を通った引数を、e-Gov・DB・略称辞書に問い合わせる前に確かめる。
 *
 * 1. 必須の文字列が空白（半角・全角スペース、タブ、改行）だけ → `<引数名> が空です`（026）
 *    配列の要素の中の必須の文字列（verify_citations の citations[].article）も同じ
 * 2. `at` が暦に無い日付 → `at が暦に無い日付です: <値>`（024）
 *
 * 違反が 2 つ以上あっても、この順で最初の 1 件だけを返す。
 */
function checkBeyondSchema(
  tool: string,
  schema: Record<string, unknown>,
  args: Record<string, unknown>
): LawServiceError | null {
  for (const name of blankTargets(schema)) {
    const v = args[name];
    if (typeof v === 'string' && v.trim() === '') {
      return blankError(tool, name, name, name);
    }
  }
  // 配列の要素（citations[].article）
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  for (const [name, sub] of Object.entries(properties)) {
    if (sub.type !== 'array' || typeof sub.items !== 'object' || sub.items === null) continue;
    const list = args[name];
    if (!Array.isArray(list)) continue;
    const fields = blankTargets(sub.items as Record<string, unknown>);
    for (const [i, element] of list.entries()) {
      for (const field of fields) {
        const v = (element as Record<string, unknown>)[field];
        if (typeof v === 'string' && v.trim() === '') {
          return blankError(tool, field, `${name}.${i}.${field}`, `${name}[${i}].${field}`);
        }
      }
    }
  }
  const at = args.at;
  if (typeof at === 'string' && 'at' in properties && !isCalendarDate(at)) {
    return makeError('INVALID_ARGUMENT', `at が暦に無い日付です: ${at}`, {
      tool,
      hint: AT_HINT,
      detail: { issues: [{ path: 'at', message: '暦に無い日付です' }] },
    });
  }
  return null;
}

function blankError(tool: string, field: string, path: string, label: string): LawServiceError {
  return makeError('INVALID_ARGUMENT', `${label} が空です`, {
    tool,
    hint: BLANK_HINTS[`${tool}.${field}`] ?? BLANK_HINTS[field],
    detail: { issues: [{ path, message: '空白だけは指定できません' }] },
  });
}
