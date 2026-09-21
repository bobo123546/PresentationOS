export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
/** 加载整个 schemas/ 目录（递归）。必须在首次 validate 前调用。 */
export declare function loadAllSchemas(rootDir?: string): Promise<number>;
/** 按 $id 校验数据。schemaId 如 "https://presentationos.local/schemas/document-ir/1" */
export declare function validate(schemaId: string, data: unknown): ValidationResult;
export declare const SCHEMA_IDS: {
    readonly documentIr: "https://presentationos.local/schemas/document-ir/1";
    readonly narrativeIr: "https://presentationos.local/schemas/narrative-ir/1";
    readonly deckSpec: "https://presentationos.local/schemas/presentation-ir/1";
    readonly layoutIr: "https://presentationos.local/schemas/layout-ir/1";
    readonly qaReport: "https://presentationos.local/schemas/qa/1";
    readonly designToken: "https://presentationos.local/schemas/design-token/1";
};
