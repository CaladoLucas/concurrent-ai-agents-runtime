import { randomUUID } from 'node:crypto';
import { AgentContext, AgentLogger } from '../../agents/base/agent.interface.js';
import { DAGGraph } from '../dag/dag-graph.js';
import { AsyncWorkerPool } from '../queue/worker-pool.js';
import { TelemetryMetricsCollector } from '../../telemetry/metrics.js';
import { OpenTelemetryTracer } from '../../telemetry/tracer.js';
import {
  ExecutionMetrics,
  NodeId,
  NodeStatus,
  SpanStatus,
  TraceId,
} from '../../types/index.js';

export interface RuntimeOptions {
  maxConcurrency?: number;
  tracer?: OpenTelemetryTracer;
  logger?: AgentLogger;
  failFast?: boolean;
}

export interface DAGExecutionResult {
  runId: string;
  traceId: TraceId;
  success: boolean;
  outputs: Map<NodeId, unknown>;
  metrics: ExecutionMetrics;
  tracer: OpenTelemetryTracer;
  graph: DAGGraph;
  errors: Map<NodeId, Error>;
}

const defaultLogger: AgentLogger = {
  info: (msg, ...args) => console.log(msg, ...args),
  warn: (msg, ...args) => console.warn(msg, ...args),
  error: (msg, ...args) => console.error(msg, ...args),
  debug: () => {},
};

/**
 * Concurrent Multi-Agent Runtime Engine.
 * Dynamically schedules DAG nodes onto an asynchronous worker pool,
 * providing Fan-Out parallel execution, Fan-In synchronization,
 * contextual data piping, and distributed OpenTelemetry metrics.
 */
export class ConcurrentAgentRuntime {
  private readonly maxConcurrency: number;
  private readonly logger: AgentLogger;
  private readonly failFast: boolean;

  constructor(options?: RuntimeOptions) {
    this.maxConcurrency = options?.maxConcurrency ?? 4;
    this.logger = options?.logger ?? defaultLogger;
    this.failFast = options?.failFast ?? true;
  }

  /**
   * Executes a DAG concurrently using the AsyncWorkerPool.
   */
  public async execute(
    graph: DAGGraph,
    initialInputs?: Map<NodeId, unknown>,
    options?: { traceId?: TraceId }
  ): Promise<DAGExecutionResult> {
    graph.validate();
    graph.reset();

    const runId = `run-${randomUUID().substring(0, 8)}`;
    const tracer = new OpenTelemetryTracer(options?.traceId);
    const pool = new AsyncWorkerPool({ maxConcurrency: this.maxConcurrency });

    const rootSpan = tracer.startSpan('workflow.dag_parallel_run', {
      attributes: {
        runId,
        maxConcurrency: this.maxConcurrency,
        totalNodes: graph.size(),
      },
    });

    const completedNodeIds = new Set<NodeId>();
    const runningNodeIds = new Set<NodeId>();
    const failedNodeIds = new Set<NodeId>();
    const outputs = new Map<NodeId, unknown>(initialInputs);
    const errors = new Map<NodeId, Error>();

    return new Promise<DAGExecutionResult>((resolve) => {
      let isSettled = false;

      const checkCompletion = () => {
        if (isSettled) return;

        const totalHandled = completedNodeIds.size + failedNodeIds.size;
        if (totalHandled === graph.size() || (this.failFast && failedNodeIds.size > 0)) {
          isSettled = true;
          tracer.endSpan(
            rootSpan.spanId,
            failedNodeIds.size > 0 ? SpanStatus.ERROR : SpanStatus.OK
          );

          const metrics = TelemetryMetricsCollector.computeMetrics(
            tracer,
            graph.size(),
            completedNodeIds.size,
            failedNodeIds.size,
            this.maxConcurrency
          );

          resolve({
            runId,
            traceId: tracer.getTraceId(),
            success: failedNodeIds.size === 0,
            outputs,
            metrics,
            tracer,
            graph,
            errors,
          });
        }
      };

      const scheduleReadyNodes = () => {
        if (isSettled) return;

        const readyNodes = graph.getReadyNodes(completedNodeIds, runningNodeIds);
        for (const node of readyNodes) {
          runningNodeIds.add(node.id);
          node.status = NodeStatus.RUNNING;
          node.startTime = Date.now();

          // Phase classification for timeline visualizer
          const isFanOut = node.dependencies.size <= 1 && node.dependents.size > 1;
          const isFanIn = node.dependencies.size > 1;
          const phase = isFanIn ? 'fan_in' : isFanOut ? 'fan_out' : 'standard';

          pool
            .submit({
              id: `task-${node.id}`,
              execute: async () => {
                const nodeSpan = tracer.startSpan(`node.${node.name}`, {
                  parentSpanId: rootSpan.spanId,
                  attributes: {
                    nodeId: node.id,
                    nodeName: node.name,
                    phase,
                    dependenciesCount: node.dependencies.size,
                  },
                });

                const agentContext: AgentContext = {
                  runId,
                  traceId: tracer.getTraceId(),
                  nodeId: node.id,
                  tracer,
                  dependencyOutputs: outputs,
                  logger: this.logger,
                };

                await node.agent.initialize(agentContext);

                try {
                  // Resolve input from inputSelector or initial inputs
                  let input: unknown = outputs.get(node.id);
                  if (node.inputSelector) {
                    input = node.inputSelector(outputs);
                  }

                  const result = await node.agent.execute(input, agentContext);
                  node.result = result;
                  node.status = NodeStatus.COMPLETED;
                  node.endTime = Date.now();
                  outputs.set(node.id, result.data);

                  tracer.setAttribute(nodeSpan.spanId, 'tokens.total', result.tokenUsage.totalTokens);
                  tracer.endSpan(nodeSpan.spanId, SpanStatus.OK);
                  await node.agent.cleanup(agentContext);

                  return result;
                } catch (err) {
                  const error = err instanceof Error ? err : new Error(String(err));
                  node.status = NodeStatus.FAILED;
                  node.error = error;
                  node.endTime = Date.now();
                  errors.set(node.id, error);

                  tracer.endSpan(nodeSpan.spanId, SpanStatus.ERROR, error.message);
                  await node.agent.cleanup(agentContext);
                  throw error;
                }
              },
            })
            .then(() => {
              runningNodeIds.delete(node.id);
              completedNodeIds.add(node.id);
              scheduleReadyNodes();
              checkCompletion();
            })
            .catch((_err) => {
              runningNodeIds.delete(node.id);
              failedNodeIds.add(node.id);
              if (this.failFast) {
                checkCompletion();
              } else {
                scheduleReadyNodes();
                checkCompletion();
              }
            });
        }

        checkCompletion();
      };

      // Initial schedule trigger
      scheduleReadyNodes();
    });
  }

  /**
   * Executes a DAG sequentially (one node at a time in topological order)
   * used as an exact baseline for speedup and efficiency benchmarking.
   */
  public async executeSequential(
    graph: DAGGraph,
    initialInputs?: Map<NodeId, unknown>
  ): Promise<DAGExecutionResult> {
    graph.validate();
    graph.reset();

    const runId = `seq-${randomUUID().substring(0, 8)}`;
    const tracer = new OpenTelemetryTracer();
    const topologicalOrder = graph.getTopologicalOrder();

    const rootSpan = tracer.startSpan('workflow.dag_sequential_run', {
      attributes: {
        runId,
        concurrency: 1,
        totalNodes: graph.size(),
      },
    });

    const completedNodeIds = new Set<NodeId>();
    const failedNodeIds = new Set<NodeId>();
    const outputs = new Map<NodeId, unknown>(initialInputs);
    const errors = new Map<NodeId, Error>();

    for (const nodeId of topologicalOrder) {
      const node = graph.getNode(nodeId)!;
      node.status = NodeStatus.RUNNING;
      node.startTime = Date.now();

      const isFanOut = node.dependencies.size <= 1 && node.dependents.size > 1;
      const isFanIn = node.dependencies.size > 1;
      const phase = isFanIn ? 'fan_in' : isFanOut ? 'fan_out' : 'standard';

      const nodeSpan = tracer.startSpan(`node.${node.name}`, {
        parentSpanId: rootSpan.spanId,
        attributes: {
          nodeId: node.id,
          nodeName: node.name,
          phase,
        },
      });

      const agentContext: AgentContext = {
        runId,
        traceId: tracer.getTraceId(),
        nodeId: node.id,
        tracer,
        dependencyOutputs: outputs,
        logger: this.logger,
      };

      try {
        await node.agent.initialize(agentContext);

        let input: unknown = outputs.get(node.id);
        if (node.inputSelector) {
          input = node.inputSelector(outputs);
        }

        const result = await node.agent.execute(input, agentContext);
        node.result = result;
        node.status = NodeStatus.COMPLETED;
        node.endTime = Date.now();
        outputs.set(node.id, result.data);
        completedNodeIds.add(node.id);

        tracer.setAttribute(nodeSpan.spanId, 'tokens.total', result.tokenUsage.totalTokens);
        tracer.endSpan(nodeSpan.spanId, SpanStatus.OK);
        await node.agent.cleanup(agentContext);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        node.status = NodeStatus.FAILED;
        node.error = error;
        node.endTime = Date.now();
        errors.set(node.id, error);
        failedNodeIds.add(node.id);

        tracer.endSpan(nodeSpan.spanId, SpanStatus.ERROR, error.message);
        await node.agent.cleanup(agentContext);

        if (this.failFast) {
          break;
        }
      }
    }

    tracer.endSpan(
      rootSpan.spanId,
      failedNodeIds.size > 0 ? SpanStatus.ERROR : SpanStatus.OK
    );

    const metrics = TelemetryMetricsCollector.computeMetrics(
      tracer,
      graph.size(),
      completedNodeIds.size,
      failedNodeIds.size,
      1
    );

    return {
      runId,
      traceId: tracer.getTraceId(),
      success: failedNodeIds.size === 0,
      outputs,
      metrics,
      tracer,
      graph,
      errors,
    };
  }
}
