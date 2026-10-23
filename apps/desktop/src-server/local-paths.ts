import { existsSync, lstatSync, realpathSync, mkdirSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';

/** Local API access stays within its explicitly selected data directory. */
export class DataPaths {
  readonly root: string;
  constructor(root: string) {
    mkdirSync(root, { recursive: true });
    this.root = realpathSync(resolve(root));
  }
  file(path: unknown): string {
    if (typeof path !== 'string' || !path.trim() || path.includes('\0')) throw new Error('A nonempty local path is required');
    const target = resolve(this.root, path);
    const rel = relative(this.root, target);
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('Path is outside the selected data directory');
    if (process.platform === 'win32' && (rel.includes(':') || rel.split(sep).some(part => /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i.test(part)))) throw new Error('Windows device paths and alternate streams are not allowed');
    let current = this.root;
    for (const segment of rel.split(sep)) {
      current = resolve(current, segment);
      let info;
      try { info = lstatSync(current); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (info) {
        if (info.isSymbolicLink()) throw new Error('Symbolic links and junctions are not allowed in API paths');
        const actual = relative(this.root, realpathSync(current));
        if (actual === '..' || actual.startsWith('..' + sep) || isAbsolute(actual)) throw new Error('Resolved path escaped the data directory');
      }
    }
    return target;
  }
}
