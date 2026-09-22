// privileged 插件示例：独立 Worker，stdio JSON Lines（与 worker-protocol 一致）
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    process.stdout.write(JSON.stringify({ type: 'job_response', jobId: '?', ok: false, errorMessage: 'bad json' }) + '\n');
    return;
  }
  if (msg.type === 'job_request') {
    const response = {
      type: 'job_response',
      jobId: msg.jobId,
      ok: true,
      output: { echo: msg.input?.text ?? null, capabilityId: msg.capabilityId },
      errorType: null,
      errorMessage: null,
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }
});

rl.on('close', () => process.exit(0));
