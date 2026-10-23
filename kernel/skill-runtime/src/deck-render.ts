// Use the same revision, QA, readback and exclusive publication path as the CLI.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createTaskService } from '@pres/workflow';

export interface RenderMarkdownResult {
  ok: boolean;
  error?: string;
  qaArtifacts: string[];
}

export async function renderMarkdownDeck(markdown: string, outPath: string, reference?: string, title?: string): Promise<RenderMarkdownResult> {
  let service: ReturnType<typeof createTaskService> | undefined;
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    const workspace = mkdtempSync(join(dirname(outPath), '.pres-skill-'));
    service = createTaskService({ dbPath: join(workspace, 'workflow.db') });
    const result = await service.compileMarkdown({ projectId: 'skill-deck-render', markdown, title,
      outPptxPath: outPath, referencePptxPath: reference });
    return { ok: result.ok, error: result.error, qaArtifacts: result.reportPath ? [result.reportPath] : [] };
  } catch (error) {
    return { ok: false, error: (error as Error).message, qaArtifacts: [] };
  } finally { service?.close(); }
}
