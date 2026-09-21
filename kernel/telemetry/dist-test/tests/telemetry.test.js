// 统一日志系统测试：CanonicalEvent / Redaction / JSONL append-only / 负向场景
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger, createEvent, sanitizeForLog, redactString } from '../src/index.js';
test('createEvent fills identity fields', () => {
    const ev = createEvent({ level: 'info', component: 'test', event_type: 'unit.test', runtime: 'node' });
    assert.ok(ev.event_id.length > 0);
    assert.ok(!Number.isNaN(Date.parse(ev.timestamp)));
    assert.ok(ev.timezone.length > 0);
    assert.equal(typeof ev.process_id, 'number');
});
test('redactString masks api keys, passwords and bearer tokens', () => {
    const s = 'api_key=sk-abc123456789 password=hunter22 Authorization: Bearer abc.def.ghi-jklm';
    const out = redactString(s);
    assert.ok(!out.includes('sk-abc123456789'), out);
    assert.ok(!out.includes('hunter22'), out);
    assert.ok(!out.includes('abc.def.ghi-jklm'), out);
    assert.ok(out.includes('[REDACTED]'));
    assert.ok(out.includes('api_key='), 'field name should be kept');
});
test('sanitizeForLog deep-redacts nested secrets', () => {
    const obj = { user: { token: 'tok-1234567890' }, meta: { ok: true }, arr: ['Bearer xxxxxyyyyyzzzz'] };
    const safe = sanitizeForLog(obj);
    assert.ok(!JSON.stringify(safe).includes('tok-1234567890'));
    assert.ok(!JSON.stringify(safe).includes('xxxxxyyyyyyzzzz'));
    assert.equal(safe.meta.ok, true);
});
test('Logger writes append-only JSONL to log dir', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pres-log-'));
    try {
        const logger = new Logger({ component: 'test-logger', logDir: dir, appVersion: '0.0.0-test' });
        await logger.info({ event_type: 'unit.test', action: 'write', result: 'ok', trace_id: 'trc-1' });
        await logger.warn({ event_type: 'unit.test', action: 'write2', result: 'warn' });
        const content = await readFile(join(dir, `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}.jsonl`), 'utf8');
        const lines = content.trim().split('\n');
        assert.equal(lines.length, 2);
        const first = JSON.parse(lines[0]);
        assert.equal(first.component, 'test-logger');
        assert.equal(first.level, 'info');
        assert.equal(first.app_version, '0.0.0-test');
        assert.equal(first.trace_id, 'trc-1');
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('Logger redacts secrets in written lines', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pres-log-sec-'));
    try {
        const logger = new Logger({ component: 'sec-test', logDir: dir });
        await logger.info({ event_type: 'unit.test', input_summary: 'token=tok-secret-1234567890', result: 'ok' });
        const content = await readFile(join(dir, `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}.jsonl`), 'utf8');
        assert.ok(!content.includes('tok-secret-1234567890'));
        assert.ok(content.includes('[REDACTED]'));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
