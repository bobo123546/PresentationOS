import { lstatSync, realpathSync, statSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { homedir } from 'node:os';

const identity = (path) => process.platform === 'win32' ? path.toLowerCase() : path;
export function assertNewOutputs(input, outputs) {
  const source = resolve(input);
  if (!statSync(source).isFile()) throw new Error('Input must be a regular file');
  const sourceReal = identity(realpathSync(source));
  const seen = new Set();
  for (const output of outputs) {
    const target = resolve(output);
    const key = identity(target);
    if (key === identity(source) || key === sourceReal || seen.has(key)) throw new Error('Input and output paths must be distinct');
    seen.add(key);
    try { lstatSync(target); throw new Error(`Refusing to overwrite existing output: ${target}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

export function defaultOutput(input, extension) {
  const root = process.env.PRES_DATA_DIR ?? (process.platform === 'win32' ? 'D:\\PresentationOSData' : join(homedir(), '.presentationos'));
  const artifacts = join(root, 'artifacts');
  mkdirSync(artifacts, { recursive: true });
  const directory = mkdtempSync(join(artifacts, 'run-'));
  return join(directory, basename(input).replace(/\.[^.]*$/, '') + extension);
}

export function writeNewJson(path, value) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), { encoding: 'utf8', flag: 'wx' });
}
