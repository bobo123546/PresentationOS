// Node Worker 核心 Capabilities
import type { Capability, ExecutionContext, ExecutionResult, ValidationResult } from '@pres/capability-registry';
import type { CapabilityRegistry } from '@pres/capability-registry';

interface TransformInput { text: string; }
interface TransformOutput { text: string; }

const transform: Capability<TransformInput, TransformOutput> = {
  id: 'text.transform',
  version: '1.0.0',
  validateInput(i: unknown): ValidationResult {
    return typeof (i as TransformInput)?.text === 'string'
      ? { valid: true, errors: [] }
      : { valid: false, errors: ['text must be a string'] };
  },
  async execute(input: TransformInput, _ctx: ExecutionContext): Promise<ExecutionResult<TransformOutput>> {
    return { ok: true, output: { text: input.text.toUpperCase() }, durationMs: 1, artifactRefs: [] };
  },
  validateOutput(o: unknown): ValidationResult {
    return typeof (o as TransformOutput)?.text === 'string' ? { valid: true, errors: [] } : { valid: false, errors: ['output.text must be a string'] };
  },
};

interface DeckPlanInput { topic: string; slides?: number; }
interface DeckPlanOutput { title: string; sections: string[]; slideCount: number; }

const deckPlan: Capability<DeckPlanInput, DeckPlanOutput> = {
  id: 'deck.plan',
  version: '0.1.0',
  validateInput(i: unknown): ValidationResult {
    return typeof (i as DeckPlanInput)?.topic === 'string' ? { valid: true, errors: [] } : { valid: false, errors: ['topic required'] };
  },
  async execute(input: DeckPlanInput): Promise<ExecutionResult<DeckPlanOutput>> {
    const n = Math.max(1, Math.min(input.slides ?? 5, 20));
    const sections = Array.from({ length: n - 1 }, (_, i) => `Section ${i + 1}`);
    return { ok: true, output: { title: input.topic, sections, slideCount: n }, durationMs: 1, artifactRefs: [] };
  },
  validateOutput(o: unknown): ValidationResult {
    return typeof (o as DeckPlanOutput)?.title === 'string' ? { valid: true, errors: [] } : { valid: false, errors: ['output.title required'] };
  },
};

export function registerCoreCapabilities(registry: CapabilityRegistry): void {
  registry.register({ capabilityId: 'text.transform', providerId: 'node-core', provider: transform, priority: 10, runtime: 'node' });
  registry.register({ capabilityId: 'deck.plan', providerId: 'node-core', provider: deckPlan, priority: 10, runtime: 'node' });
}
