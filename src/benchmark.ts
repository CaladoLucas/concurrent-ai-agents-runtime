import pc from 'picocolors';
import { RawDocumentInput } from './agents/specialized/types.js';
import { ConcurrentAgentRuntime } from './core/runtime/orchestrator.js';
import { buildEnterpriseCreditDAG } from './workflows/credit-analysis.pipeline.js';

const mockDossier: RawDocumentInput = {
  documentId: 'BENCH-DOC-001',
  companyName: 'OmniHealth Diagnósticos S.A.',
  rawText: `Receita Anual: R$ 94.800.000,00 Ativo Total: R$ 74.200.000,00 Ativo Circulante: R$ 42.600.000,00 Passivo Circulante: R$ 20.100.000,00 CND Federal: Válida Encarregado de Dados DPO nomeado`,
  simulationDelayMs: 25, // Lower delay for quick multi-run benchmarking
};

interface ConcurrencyBenchResult {
  concurrency: number;
  totalRuns: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  throughputPerSec: number;
  speedupVsSequential: number;
}

async function benchmarkLevel(concurrency: number, iterations = 5): Promise<ConcurrencyBenchResult> {
  const latencies: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const { graph, entryNodeId } = buildEnterpriseCreditDAG({
      extractorDelayMs: 25,
      financialDelayMs: 30,
      complianceDelayMs: 30,
      synthesisDelayMs: 20,
    });

    const runtime = new ConcurrentAgentRuntime({
      maxConcurrency: concurrency,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    const inputs = new Map([[entryNodeId, mockDossier]]);

    const start = Date.now();
    if (concurrency === 1) {
      await runtime.executeSequential(graph, inputs);
    } else {
      await runtime.execute(graph, inputs);
    }
    latencies.push(Date.now() - start);
  }

  latencies.sort((a, b) => a - b);
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? latencies[latencies.length - 1]!;

  return {
    concurrency,
    totalRuns: iterations,
    avgLatencyMs: avg,
    p95LatencyMs: p95,
    throughputPerSec: Number((1000 / avg).toFixed(2)),
    speedupVsSequential: 1.0,
  };
}

async function runBenchmark(): Promise<void> {
  console.log(pc.bold(pc.cyan('================================================================')));
  console.log(pc.bold(pc.cyan('      CONCURRENT MULTI-AGENT RUNTIME BENCHMARK SUITE            ')));
  console.log(pc.bold(pc.cyan('================================================================')));
  console.log(pc.dim('Benchmarking DAG workflows across concurrency worker pool allocations...\n'));

  const concurrencyLevels = [1, 2, 4, 8];
  const results: ConcurrencyBenchResult[] = [];

  for (const c of concurrencyLevels) {
    process.stdout.write(`Testing Concurrency Level = ${c} workers... `);
    const res = await benchmarkLevel(c, 6);
    results.push(res);
    console.log(pc.green(`Done (${res.avgLatencyMs}ms avg)`));
  }

  const baselineAvg = results[0]?.avgLatencyMs || 1;
  for (const r of results) {
    r.speedupVsSequential = Number((baselineAvg / r.avgLatencyMs).toFixed(2));
  }

  console.log('');
  console.log(pc.bold(pc.yellow('--- BENCHMARK RESULTS SUMMARY ---')));
  console.table(
    results.map((r) => ({
      Concurrency: `${r.concurrency} Worker(s)`,
      AvgLatency: `${r.avgLatencyMs} ms`,
      P95Latency: `${r.p95LatencyMs} ms`,
      Throughput: `${r.throughputPerSec} wf/s`,
      Speedup: `${r.speedupVsSequential}x`,
    }))
  );

  console.log(pc.green('✔ Benchmark completed successfully.\n'));
}

runBenchmark().catch(console.error);
