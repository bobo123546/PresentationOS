// PresentationOS CLI 入口（PHASE 0 最小可构建版本）
// 正式 CLI 功能随 PHASE 7+ 实现
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { name: string; version: string };

export function main(argv: string[]): number {
  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(`${pkg.name} ${pkg.version}`);
    return 0;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage: pres [--version] [--help]`);
    return 0;
  }
  console.log('PresentationOS CLI: no command provided.');
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  process.exit(main(process.argv.slice(2)));
}
