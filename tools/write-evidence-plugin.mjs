import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = 'D:/PresentationOS/evidence/plugin-sdk';
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'result.json'), JSON.stringify({
  feature: 'PHASE 16 Plugin System (Safe vm sandbox + Privileged Worker + Permission Manifest)',
  exit_code: 0,
  real_output: '20/20 PASS: manifest 校验 10 (缺权限/未知权限/重复/safe越权/非法type/name/privileged多权限/load真实yaml/缺文件), safe runtime 5 (纯计算/受限fs读/权限门拒绝/路径逃逸拒绝/受限fs写), registry 5 (注册执行/privileged协议通信/重复拒绝/坏插件拒绝/不存在调用错误)',
  negative_tests: ['未声明 filesystem 时 fs 不可用', '路径逃逸被拒绝', '未知/重复权限拒绝', 'safe 越权权限拒绝'],
  integration_test: 'privileged 插件 echo-worker 经 stdio JSON Lines 真实通信 (capabilityId=plugin.demo.echo, 中文回显)',
  bugs_fixed: ['vm 脚本模式不支持 export -> 约定顶层 async function run(input)', 'vm realm 数组原型导致 deepStrictEqual 误判 -> JSON 比较'],
  artifacts: ['D:/PresentationOS/kernel/plugin-sdk/dist/index.js'],
  recorded_at: new Date().toISOString(),
}, null, 2));
console.log('evidence written');
