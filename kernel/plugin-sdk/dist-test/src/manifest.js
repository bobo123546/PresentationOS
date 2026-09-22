// Plugin Manifest 解析与校验（Permission Manifest 必须显式声明）
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { PERMISSIONS } from './types.js';
const NAME_RE = /^[a-z0-9][a-z0-9-_.]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
export function validateManifest(raw) {
    const errors = [];
    if (raw === null || typeof raw !== 'object') {
        return { ok: false, errors: ['manifest 必须是对象'] };
    }
    const m = raw;
    const name = m.name;
    if (typeof name !== 'string' || !NAME_RE.test(name)) {
        errors.push('name 必填，须匹配 ^[a-z0-9][a-z0-9-_.]*$');
    }
    const version = m.version;
    if (typeof version !== 'string' || !VERSION_RE.test(version)) {
        errors.push('version 必填，须为 x.y.z');
    }
    const type = m.type;
    if (type !== 'safe' && type !== 'privileged') {
        errors.push('type 必须是 safe 或 privileged');
    }
    const perms = m.permissions;
    if (!Array.isArray(perms) || perms.length === 0) {
        errors.push('permissions 必填且非空（Permission Manifest 必须显式声明）');
    }
    else {
        const seen = new Set();
        for (const p of perms) {
            if (typeof p !== 'string' || !PERMISSIONS.includes(p)) {
                errors.push(`未知权限: ${String(p)}（合法集合: ${PERMISSIONS.join(', ')}）`);
            }
            else if (seen.has(p)) {
                errors.push(`重复权限: ${p}`);
            }
            else {
                seen.add(p);
            }
        }
        if (type === 'safe') {
            for (const p of perms) {
                if (typeof p === 'string' && !SAFE_PERMISSIONS_STR.includes(p)) {
                    errors.push(`safe 插件不允许权限 ${p}（受限运行时仅支持 ${SAFE_PERMISSIONS_STR.join(', ')}，其余须用 privileged）`);
                }
            }
        }
    }
    const entry = m.entry;
    if (typeof entry !== 'string' || entry.length === 0) {
        errors.push('entry 必填（相对插件目录的入口文件）');
    }
    if (errors.length > 0) {
        return { ok: false, errors };
    }
    const manifest = {
        name: name,
        version: version,
        type: type,
        permissions: perms,
        entry: entry,
    };
    if (typeof m.description === 'string')
        manifest.description = m.description;
    if (typeof m.capability === 'string' && m.capability.length > 0)
        manifest.capability = m.capability;
    if (typeof m.author === 'string')
        manifest.author = m.author;
    return { ok: true, manifest, errors: [] };
}
const SAFE_PERMISSIONS_STR = ['filesystem.read', 'filesystem.write'];
/** 读取并校验 plugin.yaml */
export function loadManifest(pluginDir) {
    let text;
    try {
        text = readFileSync(`${pluginDir}/plugin.yaml`, 'utf8');
    }
    catch (e) {
        return { ok: false, errors: [`无法读取 plugin.yaml: ${e.message}`] };
    }
    let raw;
    try {
        raw = parse(text);
    }
    catch (e) {
        return { ok: false, errors: [`plugin.yaml 解析失败: ${e.message}`] };
    }
    return validateManifest(raw);
}
