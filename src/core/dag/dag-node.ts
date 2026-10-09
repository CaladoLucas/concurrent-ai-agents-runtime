import {
  DEFAULT_RETRY_POLICY,
  NodeId,
  NodeStatus,
  RetryPolicy,
} from '../../types/index.js';
import { AgentExecutionResult, IAgent } from '../../agents/base/agent.interface.js';

export interface DAGNodeConfig<TInput = any, TOutput = any> {
  id: NodeId;
  name: string;
  agent: IAgent<TInput, TOutput>;
  dependencies?: NodeId[];
  retryPolicy?: Partial<RetryPolicy>;
  timeoutMs?: number;
  inputSelector?: (dependencyOutputs: Map<NodeId, unknown>) => TInput;
}

/**
 * Node within a Directed Acyclic Graph representing an individual specialized agent task.
 */
export class DAGNode<TInput = any, TOutput = any> {
  public readonly id: NodeId;
  public readonly name: string;
  public readonly agent: IAgent<TInput, TOutput>;
  public readonly dependencies: Set<NodeId>;
  public readonly dependents: Set<NodeId>;
  public readonly retryPolicy: RetryPolicy;
  public readonly timeoutMs?: number;
  public readonly inputSelector?: (dependencyOutputs: Map<NodeId, unknown>) => TInput;

  public status: NodeStatus = NodeStatus.IDLE;
  public result?: AgentExecutionResult<TOutput>;
  public error?: Error;
  public retryCount = 0;
  public startTime?: number;
  public endTime?: number;

  constructor(config: DAGNodeConfig<TInput, TOutput>) {
    this.id = config.id;
    this.name = config.name;
    this.agent = config.agent;
    this.dependencies = new Set(config.dependencies ?? []);
    this.dependents = new Set();
    this.retryPolicy = {
      ...DEFAULT_RETRY_POLICY,
      ...(config.agent.retryPolicy ?? {}),
      ...(config.retryPolicy ?? {}),
    };
    this.timeoutMs = config.timeoutMs;
    this.inputSelector = config.inputSelector;
  }

  public reset(): void {
    this.status = NodeStatus.IDLE;
    this.result = undefined;
    this.error = undefined;
    this.retryCount = 0;
    this.startTime = undefined;
    this.endTime = undefined;
  }

  public isReady(completedNodeIds: Set<NodeId>): boolean {
    if (this.status !== NodeStatus.IDLE && this.status !== NodeStatus.PENDING) {
      return false;
    }
    for (const depId of this.dependencies) {
      if (!completedNodeIds.has(depId)) {
        return false;
      }
    }
    return true;
  }
}
