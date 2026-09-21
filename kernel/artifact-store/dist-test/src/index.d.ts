export interface ArtifactMeta {
    ref: string;
    sha256: string;
    size: number;
    contentType: string;
    originalName: string;
    createdAt: string;
    workflowRunId?: string;
    capabilityId?: string;
    traceId?: string;
    [k: string]: unknown;
}
export interface ArtifactRecord {
    meta: ArtifactMeta;
    path: string;
}
export declare class ArtifactStore {
    private readonly root;
    private readonly indexFile;
    private index;
    constructor(root: string);
    private loadIndex;
    private blobPath;
    /** 写入字节；内容相同（同 sha256）返回已有 ref（去重） */
    put(data: Buffer | string, opts?: {
        originalName?: string;
        contentType?: string;
        workflowRunId?: string;
        capabilityId?: string;
        traceId?: string;
    }): ArtifactMeta;
    private appendIndex;
    get(ref: string): ArtifactRecord | null;
    read(ref: string): Buffer | null;
    list(filter?: {
        capabilityId?: string;
        workflowRunId?: string;
    }): ArtifactMeta[];
    /** 目录总大小（blobs） */
    totalBytes(): number;
    filePathFor(ref: string): string | null;
}
export declare function artifactFileName(meta: ArtifactMeta): string;
