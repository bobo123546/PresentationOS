import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

function installedPackage(from, name) {
  let directory = from;
  while (true) {
    const candidate = join(directory, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    const parent = dirname(directory); if (parent === directory) break; directory = parent;
  }
  const req = createRequire(join(from, 'package.json'));
  let entry = req.resolve(name);
  while (dirname(entry) !== entry) {
    entry = dirname(entry);
    if (existsSync(join(entry, 'package.json')) && JSON.parse(readFileSync(join(entry, 'package.json'))).name === name) return realpathSync(entry);
  }
  throw new Error(`Cannot resolve production dependency ${name} from ${from}`);
}

/** Materialize the resolved production graph, including version conflicts, without pnpm links. */
export function bundleDependencies(sourcePackage, targetRoot) {
  const inventory = [], installed = new Map();
  const excluded = new Set(['node_modules', '.git', 'dist-test', 'obj', 'bin', 'coverage']);
  function visibleIdentity(consumer, name) {
    let directory = consumer;
    while (true) {
      const identity = installed.get(join(directory, 'node_modules', name));
      if (identity) return identity;
      if (directory === targetRoot) return undefined;
      const parent = dirname(directory); if (parent === directory) return undefined; directory = parent;
    }
  }
  function copyDependency(source, name, consumer) {
    const identity = realpathSync(source);
    const visible = visibleIdentity(consumer, name);
    if (visible === identity) return;
    const destination = visible ? join(consumer, 'node_modules', name) : join(targetRoot, 'node_modules', name);
    if (existsSync(destination)) throw new Error(`Dependency conflict at ${destination}`);
    installed.set(destination, identity);
    const metadata = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true, dereference: true, filter: (path) => {
      const parts = relative(source, path).split(sep);
      return !parts.some(p => excluded.has(p));
    } });
    if (metadata.name.startsWith('@pres/') && !existsSync(join(destination, 'dist'))) throw new Error(`Build the workspace dependency first: ${name}`);
    const record = { name: metadata.name, version: metadata.version, license: metadata.license ?? (metadata.name.startsWith('@pres/') ? 'MIT (repository)' : 'UNKNOWN'), path: relative(targetRoot, destination).split(sep).join('/'), dependencies: Object.keys(metadata.dependencies ?? {}) };
    inventory.push(record);
    const optional = new Set(Object.keys(metadata.optionalDependencies ?? {}));
    for (const dependency of new Set([...Object.keys(metadata.dependencies ?? {}), ...optional])) {
      let installed;
      try { installed = installedPackage(source, dependency); }
      catch (error) { if (optional.has(dependency)) continue; throw error; }
      copyDependency(installed, dependency, destination);
    }
  }
  const root = JSON.parse(readFileSync(join(sourcePackage, 'package.json'), 'utf8'));
  for (const name of Object.keys(root.dependencies ?? {})) copyDependency(installedPackage(sourcePackage, name), name, targetRoot);
  return inventory;
}
