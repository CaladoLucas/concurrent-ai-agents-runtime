import { describe, expect, it } from 'vitest';
import { DAGGraph } from '../src/core/dag/dag-graph.js';
import { DAGNode } from '../src/core/dag/dag-node.js';
import { BaseAgent } from '../src/agents/base/base-agent.js';
import { AgentContext } from '../src/agents/base/agent.interface.js';

class MockAgent extends BaseAgent<any, any> {
  constructor(name: string) {
    super({
      metadata: {
        id: `mock.${name}`,
        name,
        version: '1.0.0',
        description: 'Mock test agent',
      },
    });
  }

  protected async process(input: any, context: AgentContext) {
    return {
      data: { processed: true, input },
      tokenUsage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    };
  }
}

describe('DAG Engine - Graph Structure, Cycles and Topological Sort', () => {
  it('should build a valid DAG and return topological ordering', () => {
    const dag = new DAGGraph();

    const nodeA = new DAGNode({ id: 'A', name: 'Node A', agent: new MockAgent('A') });
    const nodeB = new DAGNode({ id: 'B', name: 'Node B', agent: new MockAgent('B'), dependencies: ['A'] });
    const nodeC = new DAGNode({ id: 'C', name: 'Node C', agent: new MockAgent('C'), dependencies: ['A'] });
    const nodeD = new DAGNode({ id: 'D', name: 'Node D', agent: new MockAgent('D'), dependencies: ['B', 'C'] });

    dag.addNode(nodeA);
    dag.addNode(nodeB);
    dag.addNode(nodeC);
    dag.addNode(nodeD);

    expect(dag.size()).toBe(4);
    expect(dag.detectCycles()).toBeNull();

    const order = dag.getTopologicalOrder();
    expect(order[0]).toBe('A');
    expect(order.indexOf('D')).toBe(3);
    expect(order.includes('B')).toBe(true);
    expect(order.includes('C')).toBe(true);
  });

  it('should detect cycles and throw validation errors for simple circular dependencies', () => {
    const dag = new DAGGraph();

    const nodeA = new DAGNode({ id: 'A', name: 'Node A', agent: new MockAgent('A'), dependencies: ['B'] });
    const nodeB = new DAGNode({ id: 'B', name: 'Node B', agent: new MockAgent('B'), dependencies: ['A'] });

    dag.addNode(nodeA);
    dag.addNode(nodeB);

    const cycle = dag.detectCycles();
    expect(cycle).not.toBeNull();
    expect(cycle).toContain('A');
    expect(cycle).toContain('B');

    expect(() => dag.validate()).toThrow(/Cycle detected/i);
    expect(() => dag.getTopologicalOrder()).toThrow();
  });

  it('should detect multi-node complex cycles (A -> B -> C -> D -> B)', () => {
    const dag = new DAGGraph();

    dag.addNode(new DAGNode({ id: 'A', name: 'A', agent: new MockAgent('A') }));
    dag.addNode(new DAGNode({ id: 'B', name: 'B', agent: new MockAgent('B'), dependencies: ['A', 'D'] }));
    dag.addNode(new DAGNode({ id: 'C', name: 'C', agent: new MockAgent('C'), dependencies: ['B'] }));
    dag.addNode(new DAGNode({ id: 'D', name: 'D', agent: new MockAgent('D'), dependencies: ['C'] }));

    const cycle = dag.detectCycles();
    expect(cycle).not.toBeNull();
    expect(cycle).toEqual(expect.arrayContaining(['B', 'C', 'D', 'B']));
  });

  it('should throw validation error when a dependency node does not exist', () => {
    const dag = new DAGGraph();
    dag.addNode(new DAGNode({ id: 'A', name: 'A', agent: new MockAgent('A'), dependencies: ['NON_EXISTENT'] }));

    expect(() => dag.validate()).toThrow(/depends on unknown node "NON_EXISTENT"/i);
  });

  it('should correctly partition nodes into parallel execution tiers (waves)', () => {
    const dag = new DAGGraph();

    // Tier 0: Root nodes A1, A2
    dag.addNode(new DAGNode({ id: 'A1', name: 'A1', agent: new MockAgent('A1') }));
    dag.addNode(new DAGNode({ id: 'A2', name: 'A2', agent: new MockAgent('A2') }));

    // Tier 1: Nodes B1 depends on A1; B2 depends on A1 & A2
    dag.addNode(new DAGNode({ id: 'B1', name: 'B1', agent: new MockAgent('B1'), dependencies: ['A1'] }));
    dag.addNode(new DAGNode({ id: 'B2', name: 'B2', agent: new MockAgent('B2'), dependencies: ['A1', 'A2'] }));

    // Tier 2: C depends on B1 & B2
    dag.addNode(new DAGNode({ id: 'C', name: 'C', agent: new MockAgent('C'), dependencies: ['B1', 'B2'] }));

    const tiers = dag.getExecutionTiers();
    expect(tiers.length).toBe(3);
    expect(tiers[0]).toEqual(expect.arrayContaining(['A1', 'A2']));
    expect(tiers[1]).toEqual(expect.arrayContaining(['B1', 'B2']));
    expect(tiers[2]).toEqual(['C']);
  });

  it('should return independent root nodes with in-degree 0', () => {
    const dag = new DAGGraph();
    dag.addNode(new DAGNode({ id: 'root1', name: 'Root 1', agent: new MockAgent('root1') }));
    dag.addNode(new DAGNode({ id: 'root2', name: 'Root 2', agent: new MockAgent('root2') }));
    dag.addNode(new DAGNode({ id: 'child', name: 'Child', agent: new MockAgent('child'), dependencies: ['root1'] }));

    const roots = dag.getIndependentNodes();
    expect(roots.map((r) => r.id)).toEqual(expect.arrayContaining(['root1', 'root2']));
    expect(roots.length).toBe(2);
  });
});
