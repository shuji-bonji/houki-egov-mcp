/**
 * tools/list に出す inputSchema で、tools/call の引数を検査する（SPEC-EGOV-COMMON-ERRORS-003・021・022）。
 *
 * v0.15.4 までは SDK の `fromJsonSchema`（ajv）を使っていたが、ajv の結果は違反をすべて 1 つの英文に
 * つないで返し、どの引数の違反かを示す path を持たない。違反 1 件ごとに引数名と日本語の文を返すため、
 * houki-egov-mcp の inputSchema で使うキーワードだけを確かめる検査をここに置く。
 *
 * 対応するキーワード: type（単独と、number・string の和）・properties・required・additionalProperties・
 * enum・minimum・maximum・pattern（at の形だけ）・minLength（1 だけ）・items・minItems・maxItems。
 * それ以外のキーワードが inputSchema にあれば、`assertSupportedSchema` がサーバーの起動時に例外を投げる。
 */

/** 違反 1 件。path は引数名（入れ子は `citations.0.paragraph`） */
export interface InputIssue {
  path: string;
  message: string;
}

/** at の形（SPEC-EGOV-COMMON-ERRORS-024） */
export const AT_PATTERN = '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';

/** pattern ごとの message（SPEC-EGOV-COMMON-ERRORS-022） */
const PATTERN_MESSAGES: Record<string, string> = {
  [AT_PATTERN]: 'YYYY-MM-DD の形で指定してください',
};

/** 型ごとの message（SPEC-EGOV-COMMON-ERRORS-022） */
const TYPE_MESSAGES: Record<string, string> = {
  string: '文字列で指定してください',
  integer: '整数で指定してください',
  number: '数値で指定してください',
  boolean: 'true か false で指定してください',
  array: '配列で指定してください',
  object: 'オブジェクトで指定してください',
};

/**
 * number と string の和の型（`item` / `part` など）の message。
 * 022 の表に行が無いので、どちらの並びでもこの文にする（v0.16.0 の実装で決めた文。仕様の差分で表に足す）
 */
const NUMBER_OR_STRING_MESSAGE = '数値か文字列で指定してください';

const SUPPORTED_KEYS = new Set([
  'type',
  'description',
  'default',
  'properties',
  'required',
  'additionalProperties',
  'enum',
  'minimum',
  'maximum',
  'pattern',
  'minLength',
  'items',
  'minItems',
  'maxItems',
]);

type Schema = Record<string, unknown>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function typesOf(schema: Schema): string[] {
  const t = schema.type;
  if (t === undefined) return [];
  return Array.isArray(t) ? (t as string[]) : [t as string];
}

/**
 * inputSchema が、この検査が確かめられるキーワードだけで書かれていることを確かめる。
 * 対応していないキーワードや値があれば例外を投げる（検査を素通りさせないため）。
 */
export function assertSupportedSchema(schema: unknown, where = 'inputSchema'): void {
  if (!isPlainObject(schema)) throw new Error(`${where}: オブジェクトではありません`);
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYS.has(key)) {
      throw new Error(`${where}: 引数の検査が対応していないキーワード ${key} があります`);
    }
  }
  const types = typesOf(schema);
  if (types.length === 0) throw new Error(`${where}: type がありません`);
  if (types.length > 1) {
    const sorted = [...types].sort().join(',');
    if (sorted !== 'number,string') {
      throw new Error(`${where}: 引数の検査が対応していない型の和 ${types.join(',')} があります`);
    }
  }
  for (const t of types) {
    if (!(t in TYPE_MESSAGES)) throw new Error(`${where}: 対応していない型 ${t} があります`);
  }
  if (schema.pattern !== undefined && !(String(schema.pattern) in PATTERN_MESSAGES)) {
    throw new Error(
      `${where}: message の決まっていない pattern ${String(schema.pattern)} があります`
    );
  }
  if (schema.minLength !== undefined && schema.minLength !== 1) {
    throw new Error(`${where}: minLength は 1 だけに対応しています`);
  }
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
    throw new Error(`${where}: additionalProperties は false だけに対応しています`);
  }
  if (isPlainObject(schema.properties)) {
    for (const [name, sub] of Object.entries(schema.properties)) {
      assertSupportedSchema(sub, `${where}.${name}`);
    }
  }
  if (schema.items !== undefined) assertSupportedSchema(schema.items, `${where}.items`);
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isPlainObject(value);
    default:
      return false;
  }
}

function join(path: string, key: string | number): string {
  return path === '' ? String(key) : `${path}.${key}`;
}

/**
 * 値を inputSchema で検査し、違反の一覧を返す（違反が無ければ空配列）。
 *
 * 並びは inputSchema の properties の順（必須の引数が無いときもその位置）で、inputSchema に無い引数は
 * その後に渡された順で並べる。型が違う値は、その値の範囲や形を確かめない（違反は型の 1 件だけ）。
 */
export function validateInput(schema: Schema, value: unknown, path = ''): InputIssue[] {
  const types = typesOf(schema);
  if (!types.some((t) => matchesType(value, t))) {
    const message = types.length > 1 ? NUMBER_OR_STRING_MESSAGE : TYPE_MESSAGES[types[0]];
    return [{ path, message }];
  }
  const issues: InputIssue[] = [];

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    issues.push({ path, message: `${schema.enum.join('・')} のどれかで指定してください` });
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      issues.push({ path, message: `${schema.minimum} 以上で指定してください` });
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      issues.push({ path, message: `${schema.maximum} 以下で指定してください` });
    }
  }

  if (typeof value === 'string') {
    if (schema.minLength === 1 && value.length === 0) {
      issues.push({ path, message: '空文字は指定できません' });
    } else if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) {
      issues.push({ path, message: PATTERN_MESSAGES[schema.pattern] });
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      issues.push({ path, message: `${schema.minItems} 件以上で指定してください` });
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      issues.push({ path, message: `${schema.maxItems} 件以下で指定してください` });
    }
    if (isPlainObject(schema.items)) {
      const itemSchema = schema.items;
      value.forEach((v, i) => {
        issues.push(...validateInput(itemSchema, v, join(path, i)));
      });
    }
  }

  if (isPlainObject(value)) {
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    for (const [name, sub] of Object.entries(properties)) {
      if (Object.hasOwn(value, name) && value[name] !== undefined) {
        issues.push(...validateInput(sub as Schema, value[name], join(path, name)));
      } else if (required.includes(name)) {
        issues.push({ path: join(path, name), message: '必須の引数です' });
      }
    }
    if (schema.additionalProperties === false) {
      for (const name of Object.keys(value)) {
        if (!Object.hasOwn(properties, name)) {
          issues.push({ path: join(path, name), message: 'inputSchema に無い引数です' });
        }
      }
    }
  }

  return issues;
}

/** `YYYY-MM-DD` が暦にある日付か（形は inputSchema の pattern で確かめた後に呼ぶ） */
export function isCalendarDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}
