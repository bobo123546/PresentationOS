// Document Parser Types and Contract
export type DocumentFormat =
  | 'markdown'
  | 'plaintext'
  | 'csv'
  | 'tsv'
  | 'xlsx'
  | 'docx'
  | 'pdf'
  | 'pptx';

export interface ExtractedFact {
  factId: string;
  chunkId?: string;
  factType: 'numeric' | 'currency' | 'percentage' | 'date' | 'unit';
  literalValue: string;
  charRange?: [number, number];
  /** Extracted from a source span; does not certify the claim as true. */
  verified: boolean;
}

export type Block =
  | { type: 'heading'; level: number; text: string; facts?: ExtractedFact[] }
  | { type: 'paragraph'; text: string; facts?: ExtractedFact[] }
  | { type: 'list'; ordered: boolean; items: string[]; facts?: ExtractedFact[] }
  | { type: 'table'; headers: string[]; rows: string[][]; facts?: ExtractedFact[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'image'; src: string; caption: string };

export interface DocumentIR {
  schema: 'document-ir';
  version: '1';
  source: string;
  sourceType: DocumentFormat;
  blocks: Block[];
}

export interface ParsedDocument {
  doc: DocumentIR;
  facts: ExtractedFact[];
  /** Original UTF-8 text, or extracted body/cached-cell text for OOXML inputs. */
  rawText: string;
  sha256: string;
  summary: {
    totalBlocks: number;
    totalFacts: number;
    headingsCount: number;
    tablesCount: number;
  };
}

export interface FactPreservationReport {
  preserved: boolean;
  totalFacts: number;
  preservedFacts: number;
  missingFacts: string[];
  coverageRatio: number;
}
