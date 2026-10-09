import { AgentContext } from '../base/agent.interface.js';
import { BaseAgent } from '../base/base-agent.js';
import {
  ExecutiveSynthesisInput,
  ExecutiveSynthesisInputSchema,
  ExecutiveSynthesisOutput,
  ExecutiveSynthesisOutputSchema,
} from './types.js';

/**
 * Fan-In Synthesis Agent that aggregates asynchronous parallel outputs
 * from upstream analytical agents into a cohesive executive governance decision.
 */
export class ExecutiveSynthesisAgent extends BaseAgent<ExecutiveSynthesisInput, ExecutiveSynthesisOutput> {
  constructor(defaultDelayMs = 110) {
    super({
      metadata: {
        id: 'agent.executive-synthesis',
        name: 'ExecutiveSynthesisAgent',
        version: '2.0.0',
        description:
          'Fan-in aggregation agent that synthesizes financial risk, compliance posture, and enterprise profile into an actionable credit approval dossier.',
        author: 'Lucas Calado',
        tags: ['fan-in', 'synthesis', 'decision-engine', 'governance'],
      },
      inputSchema: ExecutiveSynthesisInputSchema,
      outputSchema: ExecutiveSynthesisOutputSchema,
    });
    this.defaultDelayMs = defaultDelayMs;
  }

  private readonly defaultDelayMs: number;

  protected async process(
    input: ExecutiveSynthesisInput,
    context: AgentContext
  ): Promise<{
    data: ExecutiveSynthesisOutput;
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
    metadata?: Record<string, unknown>;
  }> {
    const { enterprise, financialRisk, compliance } = input;
    context.logger.info(`[ExecutiveSynthesisAgent] Synthesizing multi-agent outputs for "${enterprise.companyName}"...`);

    const delay = input.simulationDelayMs ?? this.defaultDelayMs;
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }

    // Determine final decision
    let finalDecision: ExecutiveSynthesisOutput['finalDecision'] = 'APPROVED';
    let creditFacilityGrantedBrl = financialRisk.maxRecommendedCreditBrl;
    const mitigationRequirements: string[] = [];

    if (compliance.verdict === 'BLOCKED' || financialRisk.riskCategory === 'CRITICAL') {
      finalDecision = 'REJECTED';
      creditFacilityGrantedBrl = 0;
      mitigationRequirements.push('Application rejected due to critical risk or severe compliance flags.');
    } else if (
      compliance.verdict === 'CONDITIONAL_APPROVAL' ||
      financialRisk.riskCategory === 'ELEVATED' ||
      financialRisk.riskCategory === 'HIGH'
    ) {
      finalDecision = 'APPROVED_WITH_CONDITIONS';
      // Haircut credit limit by 25% for conditional approval
      creditFacilityGrantedBrl = Math.round((creditFacilityGrantedBrl * 0.75) / 50_000) * 50_000;
      mitigationRequirements.push(...compliance.auditConditions);
      if (financialRisk.liquidityRatio < 1.4) {
        mitigationRequirements.push('Personal guarantee (aval) from majority shareholders required.');
      }
      mitigationRequirements.push('Pledge of receivables (cessão fiduciária de duplicatas) equivalent to 130% of exposure.');
    } else {
      finalDecision = 'APPROVED';
      mitigationRequirements.push('Standard commercial covenant: maintain Current Ratio above 1.25x.');
      mitigationRequirements.push('Annual audit submission within 120 days after fiscal year close.');
    }

    const confidenceScore = Number(
      Math.min(
        0.98,
        (financialRisk.creditScore / 1000) * 0.5 + (compliance.complianceScore / 100) * 0.5
      ).toFixed(2)
    );

    const formattedCredit = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(creditFacilityGrantedBrl);

    const executiveSummary = [
      `Dossier executivo de aprovação de crédito para ${enterprise.companyName} (${enterprise.cnpj}).`,
      `Parecer Final: ${finalDecision}. Limite de crédito homologado: ${formattedCredit}.`,
      `Classificação de Risco Financeiro: ${financialRisk.rating} (${financialRisk.riskCategory}) com Z-Score de ${financialRisk.altmanZScore}.`,
      `Score de Conformidade e Governança: ${compliance.complianceScore}/100 com veredito ${compliance.verdict}.`,
      compliance.lgpdComplianceStatus === 'FULLY_COMPLIANT'
        ? 'Aderência total à LGPD e governança de dados.'
        : `Ressalva regulatória: postura LGPD ${compliance.lgpdComplianceStatus}.`,
    ].join(' ');

    const promptTokens = 780;
    const completionTokens = 490;

    const output: ExecutiveSynthesisOutput = {
      dossierId: `DOS-${Date.now().toString(36).toUpperCase()}`,
      evaluatedAt: new Date().toISOString(),
      companyName: enterprise.companyName,
      cnpj: enterprise.cnpj,
      finalDecision,
      confidenceScore,
      executiveSummary,
      creditFacilityGrantedBrl,
      riskRating: financialRisk.rating,
      complianceVerdict: compliance.verdict,
      mitigationRequirements,
      auditTrail: {
        extractorLatencyMs: 0,
        parallelAuditorsLatencyMs: 0,
        synthesisLatencyMs: delay,
        totalTokensUsed: promptTokens + completionTokens,
      },
    };

    return {
      data: output,
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      metadata: {
        decisionEngineVersion: 'synthesis-matrix-v3',
        fanInNodesAggregated: 3,
      },
    };
  }
}
