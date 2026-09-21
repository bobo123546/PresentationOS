export interface EditOp {
    /** 1-based slide number */
    slide: number;
    /** 按出现顺序替换的第 n 个文本形状（0-based），或 'title' 匹配第一个大字号文本形状 */
    target: number | 'title';
    text: string;
}
export interface EditResult {
    ok: boolean;
    error?: string;
    slideFiles: string[];
    changed: Array<{
        file: string;
        op: EditOp;
    }>;
}
/** 编辑 PPTX 的指定页（只改目标 shape 文本，其它部件字节不动） */
export declare function editPptx(buffer: Buffer, ops: EditOp[]): Promise<{
    buffer: Buffer;
    result: EditResult;
}>;
