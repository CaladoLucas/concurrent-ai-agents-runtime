import { NodeId } from '../../types/index.js';
import { DAGNode, DAGNodeConfig } from './dag-node.js';

/**
 * Directed Acyclic Graph (DAG) manager for multi-agent workflows.
 * Handles cycle detection, topological sorting, dependency resolution,
 * and concurrent execution wave partitioning.
 */
export class DAGGraph {
  private readonly nodes: Map<NodeId, DAGNode> = new Map();

  /**
   * Adds a node to the DAG.
   */
  public addNode<TInput = any, TOutput = any>(
    nodeOrConfig: DAGNode<TInput, TOutput> | DAGNodeConfig<TInput, TOutput>
  ): DAGNode<TInput, TOutput> {
    const node = nodeOrConfig instanceof DAGNode ? nodeOrConfig : new DAGNode(nodeOrConfig);

    if (this.nodes.has(node.id)) {
      throw new Error(`Node with ID "${node.id}" already exists in the DAG.`);
    }

    this.nodes.set(node.id, node);

    // Sync dependents for any pre-registered dependencies
    for (const depId of node.dependencies) {
      const depNode = this.nodes.get(depId);
      if (depNode) {
        depNode.dependents.add(node.id);
      }
    }

    // Sync if any previously added node had this node as a dependency
    for (const otherNode of this.nodes.values()) {
      if (otherNode.dependencies.has(node.id)) {
        node.dependents.add(otherNode.id);
      }
    }

    return node;
  }

  /**
   * Adds a directed dependency edge: `from` must complete before `to` can execute.
   */
  public addEdge(fromNodeId: NodeId, toNodeId: NodeId): this {
    const fromNode = this.nodes.get(fromNodeId);
    const toNode = this.nodes.get(toNodeId);

    if (!fromNode) {
      throw new Error(`Cannot add edge: source node "${fromNodeId}" does not exist in DAG.`);
    }
    if (!toNode) {
      throw new Error(`Cannot add edge: target node "${toNodeId}" does not exist in DAG.`);
    }

    fromNode.dependents.add(toNodeId);
    toNode.dependencies.add(fromNodeId);

    return this;
  }

  public getNode(id: NodeId): DAGNode | undefined {
    return this.nodes.get(id);
  }

  public hasNode(id: NodeId): boolean {
    return this.nodes.has(id);
  }

  public getNodes(): DAGNode[] {
    return Array.from(this.nodes.values());
  }

  public size(): number {
    return this.nodes.size;
  }

  /**
   * Detects cycles in the graph using three-color DFS.
   * Returns an array representing the cycle path (e.g. ['A', 'B', 'C', 'A']) or null if acyclic.
   */
  public detectCycles(): NodeId[] | null {
    const enum Color {
      WHITE = 0,
      GRAY = 1,
      BLACK = 2,
    }

    const colors = new Map<NodeId, Color>();

    for (const id of this.nodes.keys()) {
      colors.set(id, Color.WHITE);
    }

    for (const startId of this.nodes.keys()) {
      if (colors.get(startId) !== Color.WHITE) continue;

      const pathStack: NodeId[] = [];
      const cycle = this.dfsCycle(startId, colors, pathStack);
      if (cycle) {
        return cycle;
      }
    }

    return null;
  }

  private dfsCycle(
    currentId: NodeId,
    colors: Map<NodeId, number>,
    pathStack: NodeId[]
  ): NodeId[] | null {
    colors.set(currentId, 1); // GRAY
    pathStack.push(currentId);

    const currentNode = this.nodes.get(currentId);
    if (currentNode) {
      for (const dependentId of currentNode.dependents) {
        const depColor = colors.get(dependentId);

        if (depColor === 1) {
          // Found cycle! Extract the cycle path
          const cycleStartIndex = pathStack.indexOf(dependentId);
          const cyclePath = pathStack.slice(cycleStartIndex);
          cyclePath.push(dependentId);
          return cyclePath;
        }

        if (depColor === 0) {
          const result = this.dfsCycle(dependentId, colors, pathStack);
          if (result) return result;
        }
      }
    }

    pathStack.pop();
    colors.set(currentId, 2); // BLACK
    return null;
  }

  /**
   * Validates DAG integrity: checks that all dependencies exist and no cycles exist.
   * Throws an informative Error if invalid.
   */
  public validate(): void {
    // 1. Check for missing dependencies
    for (const node of this.nodes.values()) {
      for (const depId of node.dependencies) {
        if (!this.nodes.has(depId)) {
          throw new Error(
            `DAG validation error: Node "${node.id}" (${node.name}) depends on unknown node "${depId}".`
          );
        }
      }
    }

    // 2. Check for cycles
    const cycle = this.detectCycles();
    if (cycle) {
      throw new Error(`DAG validation error: Cycle detected in graph: ${cycle.join(' -> ')}`);
    }
  }

  /**
   * Computes topological ordering using Kahn's algorithm.
   */
  public getTopologicalOrder(): NodeId[] {
    this.validate();

    const inDegree = new Map<NodeId, number>();
    for (const [id, node] of this.nodes) {
      inDegree.set(id, node.dependencies.size);
    }

    const queue: NodeId[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    const order: NodeId[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);

      const node = this.nodes.get(current)!;
      for (const dep of node.dependents) {
        const newDeg = (inDegree.get(dep) ?? 0) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) {
          queue.push(dep);
        }
      }
    }

    if (order.length !== this.nodes.size) {
      throw new Error('Topological sort failed: graph contains unresolved dependencies or cycles.');
    }

    return order;
  }

  /**
   * Partitions nodes into parallel execution tiers (waves).
   * Tier 0: nodes with no dependencies.
   * Tier k: nodes whose dependencies are all satisfied by tiers < k.
   */
  public getExecutionTiers(): NodeId[][] {
    this.validate();

    const inDegree = new Map<NodeId, number>();
    for (const [id, node] of this.nodes) {
      inDegree.set(id, node.dependencies.size);
    }

    let currentTier: NodeId[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) {
        currentTier.push(id);
      }
    }

    const tiers: NodeId[][] = [];

    while (currentTier.length > 0) {
      tiers.push(currentTier);
      const nextTier: NodeId[] = [];

      for (const nodeId of currentTier) {
        const node = this.nodes.get(nodeId)!;
        for (const depId of node.dependents) {
          const newDeg = (inDegree.get(depId) ?? 0) - 1;
          inDegree.set(depId, newDeg);
          if (newDeg === 0) {
            nextTier.push(depId);
          }
        }
      }

      currentTier = nextTier;
    }

    return tiers;
  }

  /**
   * Returns root/entry nodes (nodes with 0 dependencies).
   */
  public getIndependentNodes(): DAGNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.dependencies.size === 0);
  }

  /**
   * Returns nodes that are ready to run: all dependencies completed, not yet running or completed.
   */
  public getReadyNodes(completedNodeIds: Set<NodeId>, activeNodeIds: Set<NodeId>): DAGNode[] {
    const ready: DAGNode[] = [];
    for (const node of this.nodes.values()) {
      if (
        (node.status === 'IDLE' || node.status === 'PENDING') &&
        !activeNodeIds.has(node.id) &&
        !completedNodeIds.has(node.id) &&
        node.isReady(completedNodeIds)
      ) {
        ready.push(node);
      }
    }
    return ready;
  }

  /**
   * Resets all nodes in the DAG to IDLE state.
   */
  public reset(): void {
    for (const node of this.nodes.values()) {
      node.reset();
    }
  }
}
