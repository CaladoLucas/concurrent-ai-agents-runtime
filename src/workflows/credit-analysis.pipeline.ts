import { DAGGraph } from '../core/dag/dag-graph.js';
import { DAGNode } from '../core/dag/dag-node.js';
import { ComplianceAuditorAgent } from '../agents/specialized/compliance-auditor.agent.js';
import { DocumentExtractorAgent } from '../agents/specialized/document-extractor.agent.js';
import { ExecutiveSynthesisAgent } from '../agents/specialized/executive-synthesis.agent.js';
import { FinancialRiskAgent } from '../agents/specialized/financial-risk.agent.js';
import {
  ComplianceAuditorOutput,
  ExtractedEnterpriseData,
  FinancialRiskOutput,
  RawDocumentInput,
} from '../agents/specialized/types.js';

export interface EnterprisePipelineOptions {
  extractorDelayMs?: number;
  financialDelayMs?: number;
  complianceDelayMs?: number;
  synthesisDelayMs?: number;
}

/**
 * Builds the canonical Enterprise Credit & Compliance DAG Workflow.
 * Demonstrates:
 * 1. Entry node (DocumentExtractorAgent)
 * 2. Fan-Out into parallel analytical engines (FinancialRiskAgent & ComplianceAuditorAgent)
 * 3. Fan-In aggregation into an executive synthesis (ExecutiveSynthesisAgent)
 */
export function buildEnterpriseCreditDAG(options?: EnterprisePipelineOptions): {
  graph: DAGGraph;
  entryNodeId: string;
} {
  const graph = new DAGGraph();

  const extractorAgent = new DocumentExtractorAgent(options?.extractorDelayMs);
  const financialRiskAgent = new FinancialRiskAgent(options?.financialDelayMs);
  const complianceAuditorAgent = new ComplianceAuditorAgent(options?.complianceDelayMs);
  const executiveSynthesisAgent = new ExecutiveSynthesisAgent(options?.synthesisDelayMs);

  // 1. Entry Node: Document Extractor
  const extractorNode = new DAGNode<RawDocumentInput, ExtractedEnterpriseData>({
    id: 'document-extractor',
    name: 'Document Extractor',
    agent: extractorAgent,
    dependencies: [],
  });
  graph.addNode(extractorNode);

  // 2. Parallel Fan-Out Node A: Financial Risk Analysis
  const financialNode = new DAGNode({
    id: 'financial-risk-auditor',
    name: 'Financial Risk Auditor',
    agent: financialRiskAgent,
    dependencies: ['document-extractor'],
    inputSelector: (outputs) => {
      const enterprise = outputs.get('document-extractor') as ExtractedEnterpriseData;
      return {
        enterprise,
        simulationDelayMs: options?.financialDelayMs,
      };
    },
  });
  graph.addNode(financialNode);

  // 3. Parallel Fan-Out Node B: Compliance & Legal Auditor
  const complianceNode = new DAGNode({
    id: 'compliance-auditor',
    name: 'Compliance & Legal Auditor',
    agent: complianceAuditorAgent,
    dependencies: ['document-extractor'],
    inputSelector: (outputs) => {
      const enterprise = outputs.get('document-extractor') as ExtractedEnterpriseData;
      return {
        enterprise,
        simulationDelayMs: options?.complianceDelayMs,
      };
    },
  });
  graph.addNode(complianceNode);

  // 4. Fan-In Node: Executive Synthesis & Credit Committee Verdict
  const synthesisNode = new DAGNode({
    id: 'executive-synthesis',
    name: 'Executive Synthesis Verdict',
    agent: executiveSynthesisAgent,
    dependencies: ['document-extractor', 'financial-risk-auditor', 'compliance-auditor'],
    inputSelector: (outputs) => {
      const enterprise = outputs.get('document-extractor') as ExtractedEnterpriseData;
      const financialRisk = outputs.get('financial-risk-auditor') as FinancialRiskOutput;
      const compliance = outputs.get('compliance-auditor') as ComplianceAuditorOutput;

      return {
        enterprise,
        financialRisk,
        compliance,
        simulationDelayMs: options?.synthesisDelayMs,
      };
    },
  });
  graph.addNode(synthesisNode);

  return { graph, entryNodeId: 'document-extractor' };
}
