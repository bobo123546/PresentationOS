// Schema 验证器：加载 schemas/ 下的 JSON Schema 2020-12，提供 validate()。
// 所有 IR / 协议必须经本验证器校验后才可进入正式 Runtime。
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Ajv2020: new (opts?: Record<string, unknown>) => {
  addSchema(schema: unknown, key?: string): unknown;
  getSchema(key: string): ((data: unknown) => boolean) | undefined;
} = require('ajv/dist/2020.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const addFormats: (ajv: unknown) => void = require('ajv-formats');

const __dirname = dirname(fileURLToPath(import.meta.url));
function schemaRoot(start: string): string {
  let directory = start;
  for (let i = 0; i < 12; i++) {
    const file = join(directory, 'package.json');
    if (existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).name === 'presentationos') return join(directory, 'schemas');
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error('PresentationOS schema directory not found; set PRES_SCHEMA_DIR');
}
const SCHEMA_ROOT = process.env.PRES_SCHEMA_DIR ?? schemaRoot(__dirname);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const loaded = new Map<string, unknown>();

/** 加载整个 schemas/ 目录（递归）。必须在首次 validate 前调用。 */
export async function loadAllSchemas(rootDir: string = SCHEMA_ROOT): Promise<number> {
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(p);
      } else if (e.name.endsWith('.schema.json')) {
        const raw = await readFile(p, 'utf8');
        const schema = JSON.parse(raw) as { $id?: string };
        if (schema.$id && !ajv.getSchema(schema.$id)) {
          ajv.addSchema(schema, schema.$id);
          loaded.set(schema.$id, schema);
        }
      }
    }
  }
  await walk(rootDir);
  return loaded.size;
}

/** 按 $id 校验数据。schemaId 如 "https://presentationos.local/schemas/document-ir/1" */
export function validate(schemaId: string, data: unknown): ValidationResult {
  const validateFn = ajv.getSchema(schemaId);
  if (!validateFn) {
    return { valid: false, errors: [`schema not loaded: ${schemaId}`] };
  }
  const ok = validateFn(data);
  if (ok) return { valid: true, errors: [] };
  const errors: string[] = ((validateFn as { errors?: Array<{ instancePath?: string; message?: string }> }).errors ?? []).map((e) =>
    `${e.instancePath ?? '/'} ${e.message ?? 'invalid'}`
  );
  return { valid: false, errors };
}

export const SCHEMA_IDS = {
  documentIr: 'https://presentationos.local/schemas/document-ir/1',
  narrativeIr: 'https://presentationos.local/schemas/narrative-ir/1',
  deckSpec: 'https://presentationos.local/schemas/presentation-ir/1',
  layoutIr: 'https://presentationos.local/schemas/layout-ir/1',
  qaReport: 'https://presentationos.local/schemas/qa/1',
  designToken: 'https://presentationos.local/schemas/design-token/1',
  project: 'https://presentationos.local/schemas/project/1',
  renderIr: 'https://presentationos.local/schemas/render-ir/1',
  evidenceIr: 'https://presentationos.local/schemas/evidence-ir/1',
  revision: 'https://presentationos.local/schemas/revision/1',
} as const;
