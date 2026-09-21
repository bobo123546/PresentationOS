export interface QARect {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface QAFinding {
    check: string;
    severity: 'error' | 'warning';
    message: string;
    itemId?: string;
}
export interface QAResult {
    ok: boolean;
    findings: QAFinding[];
    checks: Record<string, number>;
}
export interface MechanicalQaInput {
    pageWidth: number;
    pageHeight: number;
    rects: QARect[];
    blocks?: Array<{
        id?: string;
        type: string;
        text?: string;
        chartType?: string;
        data?: {
            labels?: string[];
            series?: Array<{
                name?: string;
                values?: number[];
            }>;
        };
    }>;
}
export declare function runMechanicalQa(input: MechanicalQaInput): QAResult;
