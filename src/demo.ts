import pc from 'picocolors';
import { RawDocumentInput } from './agents/specialized/types.js';
import { ConcurrentAgentRuntime } from './core/runtime/orchestrator.js';
import { TelemetryTimelineVisualizer } from './telemetry/timeline.js';
import { buildEnterpriseCreditDAG } from './workflows/credit-analysis.pipeline.js';

const sampleCorporateDossier: RawDocumentInput = {
  documentId: 'DOC-BR-2026-9812A',
  companyName: 'OmniHealth Diagnósticos e Gestão Hospitalar S.A.',
  rawText: `
RELATÓRIO DE ANÁLISE CORPORATIVA & BALANÇO PATRIMONIAL CONSOLIDADO
Empresa: OmniHealth Diagnósticos e Gestão Hospitalar S.A.
CNPJ: 33.592.510/0001-54
Data Base: 31/12/2025
Setor: Diagnóstico Médico, Saúde Complementar e Gestão Hospitalar

SUMÁRIO FINANCEIRO (EM REAIS):
Receita Anual: R$ 94.800.000,00
Ativo Total: R$ 74.200.000,00
Ativo Circulante: R$ 42.600.000,00
Passivo Circulante: R$ 20.100.000,00
Passivo Não Circulante: R$ 14.800.000,00
Lucro Líquido: R$ 13.950.000,00
EBITDA: R$ 22.400.000,00

GOVERNANÇA CORPORATIVA & QUADRO SOCIETÁRIO:
- Dr. Roberto Silveira (CEO & Diretor Presidente)
- Dra. Vanessa Albuquerque (Diretora Financeira & Relações com Investidores)
- Carlos Eduardo Mendes (Diretor de Operações)
Encarregado de Dados (DPO nomeado perante a ANPD)
Política de Privacidade e LGPD aprovada pelo conselho de administração.

SITUAÇÃO FISCAL E JURÍDICA:
CND Federal: Válida até 18/11/2026
Ações Cíveis / Trabalhistas ativas: 3 processos em fase de recurso ordinário sem risco iminente de penhora.
  `,
  simulationDelayMs: 150,
};

async function runDemo(): Promise<void> {
  console.clear();
  console.log(pc.bold(pc.cyan('╔══════════════════════════════════════════════════════════════════════════════════════════╗')));
  console.log(pc.bold(pc.cyan('║               CONCURRENT AI AGENTS RUNTIME & PARALLEL DAG ENGINE                         ║')));
  console.log(pc.bold(pc.cyan('║  High-Throughput Asynchronous Agent Orchestration with OpenTelemetry Observability       ║')));
  console.log(pc.bold(pc.cyan('║  Architected by Lucas Calado (Recife/PE) • Distributed Systems & AI Runtime              ║')));
  console.log(pc.bold(pc.cyan('╚══════════════════════════════════════════════════════════════════════════════════════════╝')));
  console.log('');

  console.log(pc.bold(pc.white('▶ INITIATING ENTERPRISE ANALYTICAL WORKFLOW:')));
  console.log(`  Target Entity:   ${pc.yellow(sampleCorporateDossier.companyName)}`);
  console.log(`  Document ID:     ${pc.dim(sampleCorporateDossier.documentId)}`);
  console.log(`  Simulation Mode: Realistic LLM & Quantitative Audit Latency (150ms per agent)`);
  console.log('');

  // 1. Concurrent DAG Execution
  console.log(pc.bold(pc.blue('─── [1/2] RUNNING PARALLEL DAG EXECUTION (Worker Pool Concurrency = 4) ───')));
  const { graph: parallelGraph, entryNodeId } = buildEnterpriseCreditDAG({
    extractorDelayMs: 160,
    financialDelayMs: 180,
    complianceDelayMs: 170,
    synthesisDelayMs: 140,
  });

  const parallelRuntime = new ConcurrentAgentRuntime({ maxConcurrency: 4 });
  const initialInputs = new Map([[entryNodeId, sampleCorporateDossier]]);

  const startParallel = Date.now();
  const parallelResult = await parallelRuntime.execute(parallelGraph, initialInputs);
  const parallelWallClock = Date.now() - startParallel;

  console.log(pc.green(`✔ Parallel DAG Execution completed in ${parallelWallClock}ms!`));
  console.log('');

  // 2. Sequential Execution Baseline
  console.log(pc.bold(pc.magenta('─── [2/2] RUNNING SEQUENTIAL EXECUTION BASELINE (Concurrency = 1) ──────────')));
  const { graph: seqGraph } = buildEnterpriseCreditDAG({
    extractorDelayMs: 160,
    financialDelayMs: 180,
    complianceDelayMs: 170,
    synthesisDelayMs: 140,
  });

  const seqRuntime = new ConcurrentAgentRuntime({ maxConcurrency: 1 });
  const startSeq = Date.now();
  const seqResult = await seqRuntime.executeSequential(seqGraph, initialInputs);
  const seqWallClock = Date.now() - startSeq;

  console.log(pc.green(`✔ Sequential Execution completed in ${seqWallClock}ms!`));
  console.log('');

  // 3. Render Gantt Timeline
  console.log(TelemetryTimelineVisualizer.renderAsciiTimeline(parallelResult.tracer));
  console.log('');

  // 4. Comparative Metrics Table
  console.log(pc.bold(pc.cyan('=== PERFORMANCE & CONCURRENCY BENCHMARK ===')));
  const pMetrics = parallelResult.metrics;
  const sMetrics = seqResult.metrics;

  const latencyReduction = Math.round(
    ((sMetrics.wallClockDurationMs - pMetrics.wallClockDurationMs) / sMetrics.wallClockDurationMs) * 100
  );

  console.table([
    {
      ExecutionMode: 'Sequential (Baseline)',
      WallClockLatency: `${sMetrics.wallClockDurationMs} ms`,
      CumulativeAgentTime: `${sMetrics.sequentialCumulativeMs} ms`,
      Concurrency: '1 Worker',
      Throughput: `${(1000 / sMetrics.wallClockDurationMs).toFixed(2)} ops/s`,
      TotalTokens: `${sMetrics.tokenUsage.totalTokens} tokens`,
    },
    {
      ExecutionMode: 'Concurrent DAG (Runtime)',
      WallClockLatency: `${pMetrics.wallClockDurationMs} ms`,
      CumulativeAgentTime: `${pMetrics.sequentialCumulativeMs} ms`,
      Concurrency: '4 Workers (Pool)',
      Throughput: `${(1000 / pMetrics.wallClockDurationMs).toFixed(2)} ops/s`,
      TotalTokens: `${pMetrics.tokenUsage.totalTokens} tokens`,
    },
  ]);

  console.log(
    pc.bold(
      `⚡ Latency Reduction: ${pc.green(`${latencyReduction}% faster`)} | Speedup Factor: ${pc.green(`${pMetrics.speedupFactor}x`)} | Wall-clock time saved: ${pc.green(`${pMetrics.timeSavedMs}ms`)}`
    )
  );
  console.log('');

  // 5. Final Executive Output
  const executiveOutput = parallelResult.outputs.get('executive-synthesis') as any;
  console.log(pc.bold(pc.cyan('=== FINAL EXECUTIVE DOSSIER SYNTHESIS ===')));
  console.log(`Company:        ${pc.bold(executiveOutput.companyName)} (${executiveOutput.cnpj})`);
  console.log(`Verdict:        ${pc.bold(pc.green(executiveOutput.finalDecision))}`);
  console.log(`Confidence:     ${pc.yellow(`${(executiveOutput.confidenceScore * 100).toFixed(0)}%`)}`);
  console.log(`Credit Facility: ${pc.bold(pc.yellow(`R$ ${Number(executiveOutput.creditFacilityGrantedBrl).toLocaleString('pt-BR')}`))}`);
  console.log(`Risk Rating:    ${pc.bold(executiveOutput.riskRating)}`);
  console.log(`Compliance:     ${pc.bold(executiveOutput.complianceVerdict)}`);
  console.log(`Summary:        ${executiveOutput.executiveSummary}`);
  console.log('Mitigation Covenants:');
  for (const item of executiveOutput.mitigationRequirements) {
    console.log(`  • ${item}`);
  }
  console.log('');
  console.log(pc.dim(`Trace ID: ${parallelResult.traceId} | Run ID: ${parallelResult.runId}`));
  console.log(pc.bold(pc.green('Pipeline executed successfully with 0 errors.')));
}

runDemo().catch((err) => {
  console.error(pc.red('Demo execution failed:'), err);
  process.exit(1);
});
