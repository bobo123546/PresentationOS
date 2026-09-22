import { type ManifestResult } from './types.js';
export declare function validateManifest(raw: unknown): ManifestResult;
/** 读取并校验 plugin.yaml */
export declare function loadManifest(pluginDir: string): ManifestResult;
