// PHASE 16 Plugin System —— 类型定义
// Safe Plugin: 受限运行时（vm 沙箱），适合文本转换/规则/布局算法/Style
// Privileged Plugin: 独立 Worker（stdio JSON Lines），适合 filesystem/browser/PowerPoint/GPU/FFmpeg
export const PERMISSIONS = [
    'filesystem.read',
    'filesystem.write',
    'network',
    'process',
    'browser',
    'powerpoint',
    'gpu',
    'media',
];
/** Safe 插件允许的权限（受限运行时不开网络/进程/浏览器/Office/GPU/媒体） */
export const SAFE_PERMISSIONS = ['filesystem.read', 'filesystem.write'];
