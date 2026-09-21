// Canonical Event Schema（总方案 PHASE 19，36+ 字段）
// 统一日志的唯一事件类型：所有组件/Worker 必须用本类型写日志。
let seq = 0;
export function nextEventId() {
    seq += 1;
    return `${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
export function createEvent(partial) {
    const now = new Date();
    return {
        ...partial,
        event_id: nextEventId(),
        timestamp: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        process_id: process.pid,
    };
}
