import { describe, expect, it } from 'vitest';
import {
  ComplianceAuditorOutput,
  ExecutiveSynthesisOutput,
  ExtractedEnterpriseData,
  FinancialRiskOutput,
  RawDocumentInput,
} from '../src/agents/specialized/types.js';
import { ConcurrentAgentRuntime } from '../src/core/runtime/orchestrator.js';
import { buildEnterpriseCreditDAG } from '../src/workflows/credit-analysis.pipeline.js';

const testDossier: RawDocumentInput = {
  documentId: 'TEST-DOC-2026',
  companyName: 'Clinica Médica Santa Cecília Ltda.',
  rawText: `
Relatório Patrimonial
Empresa: Clinica Médica Santa Cecília Ltda.
CNPJ: 12.345.678/0001-90
Receita Anual: R$ 48.000.000,00
Ativo Total: R$ 36.000.000,00
Ativo Circulante: R$ 22.000.000,00
Passivo Circulante: R$ 10.000.000,00
Passivo Não Circulante: R$ 6.000.000,00
Lucro Líquido: R$ 5.400.000,00
EBITDA: R$ 8.900.000,00
CND Federal: Válida
Encarregado de Dados DPO nomeado perante a autoridade nacional.
Política de Privacidade e LGPD aprovada
  `,
  simulationDelayMs: 20,
};

describe('Concurrent Agent Runtime - End-to-End Orchestration & Fan-Out / Fan-In', () => {
  it('should successfully execute full analytical pipeline with Fan-Out and Fan-In synchronization', async () => {
    const { graph, entryNodeId } = buildEnterpriseCreditDAG({
      extractorDelayMs: 20,
      financialDelayMs: 30,
      complianceDelayMs: 30,
      synthesisDelayMs: 20,
    });

    const runtime = new ConcurrentAgentRuntime({ maxConcurrency: 4 });
    const inputs = new Map([[entryNodeId, testDossier]]);

    const result = await runtime.execute(graph, inputs);

    expect(result.success).toBe(true);
    expect(result.metrics.completedNodes).toBe(4);
    expect(result.metrics.failedNodes).toBe(0);

    // Verify all outputs populated
    const extracted = result.outputs.get('document-extractor') as ExtractedEnterpriseData;
    expect(extracted).toBeDefined();
    expect(extracted.cnpj).toBe('12.345.678/0001-90');
    expect(extracted.financials.annualRevenue).toBe(48_000_000);

    const financial = result.outputs.get('financial-risk-auditor') as FinancialRiskOutput;
    expect(financial).toBeDefined();
    expect(financial.creditScore).toBeGreaterThan(600);
    expect(financial.rating).toBeDefined();

    const compliance = result.outputs.get('compliance-auditor') as ComplianceAuditorOutput;
    expect(compliance).toBeDefined();
    expect(compliance.taxComplianceStatus).toBe('VALID_CND');
    expect(compliance.verdict).toBe('CLEARED');

    const synthesis = result.outputs.get('executive-synthesis') as ExecutiveSynthesisOutput;
    expect(synthesis).toBeDefined();
    expect(synthesis.finalDecision).toBe('APPROVED');
    expect(synthesis.creditFacilityGrantedBrl).toBeGreaterThan(0);
    expect(synthesis.confidenceScore).toBeGreaterThan(0.7);

    // Check Fan-Out concurrency via spans
    const spans = result.tracer.getAllSpans();
    const financialSpan = spans.find((s) => s.attributes['nodeId'] === 'financial-risk-auditor')!;
    const complianceSpan = spans.find((s) => s.attributes['nodeId'] === 'compliance-auditor')!;
    const synthesisSpan = spans.find((s) => s.attributes['nodeId'] === 'executive-synthesis')!;

    // Financial & Compliance ran in parallel (overlapping start times)
    expect(Math.abs(financialSpan.startTime - complianceSpan.startTime)).toBeLessThan(25);

    // Synthesis started only AFTER both financial and compliance finished (Fan-In)
    expect(synthesisSpan.startTime).toBeGreaterThanOrEqual(financialSpan.endTime! - 5);
    expect(synthesisSpan.startTime).toBeGreaterThanOrEqual(complianceSpan.endTime! - 5);
  });

  it('should achieve measurable wall-clock speedup vs sequential execution', async () => {
    const delay = 40;
    const { graph: parGraph, entryNodeId } = buildEnterpriseCreditDAG({
      extractorDelayMs: delay,
      financialDelayMs: delay,
      complianceDelayMs: delay,
      synthesisDelayMs: delay,
    });

    const { graph: seqGraph } = buildEnterpriseCreditDAG({
      extractorDelayMs: delay,
      financialDelayMs: delay,
      complianceDelayMs: delay,
      synthesisDelayMs: delay,
    });

    const runtime = new ConcurrentAgentRuntime({ maxConcurrency: 4 });
    const inputs = new Map([[entryNodeId, testDossier]]);

    const parResult = await runtime.execute(parGraph, inputs);
    const seqResult = await runtime.executeSequential(seqGraph, inputs);

    // In parallel: Extractor (40ms) + Max(Fin, Comp) (40ms) + Synthesis (40ms) ~ 120ms
    // In sequential: Extractor (40ms) + Fin (40ms) + Comp (40ms) + Synthesis (40ms) ~ 160ms
    expect(parResult.metrics.wallClockDurationMs).toBeLessThan(seqResult.metrics.wallClockDurationMs);
    expect(parResult.metrics.timeSavedMs).toBeGreaterThan(0);
  });
});
