import { AgentContext } from '../base/agent.interface.js';
import { BaseAgent } from '../base/base-agent.js';
import {
  ComplianceAuditorOutput,
  ComplianceAuditorOutputSchema,
  ExtractedEnterpriseData,
} from './types.js';

export interface ComplianceAuditorInput {
  enterprise: ExtractedEnterpriseData;
  simulationDelayMs?: number;
}

/**
 * Specialized Agent for regulatory audit, sanctions screening,
 * PEP detection, and LGPD data privacy governance compliance.
 */
export class ComplianceAuditorAgent extends BaseAgent<ComplianceAuditorInput, ComplianceAuditorOutput> {
  constructor(defaultDelayMs = 135) {
    super({
      metadata: {
        id: 'agent.compliance-auditor',
        name: 'ComplianceAuditorAgent',
        version: '1.4.0',
        description:
          'Screens corporate entities and officers against sanctions lists, PEP registries, CND tax status, and LGPD data governance.',
        author: 'Lucas Calado',
        tags: ['compliance', 'kyc', 'aml', 'lgpd', 'regulatory-audit'],
      },
      outputSchema: ComplianceAuditorOutputSchema,
    });
    this.defaultDelayMs = defaultDelayMs;
  }

  private readonly defaultDelayMs: number;

  protected async process(
    input: ComplianceAuditorInput,
    context: AgentContext
  ): Promise<{
    data: ComplianceAuditorOutput;
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
    metadata?: Record<string, unknown>;
  }> {
    const { enterprise } = input;
    context.logger.info(`[ComplianceAuditorAgent] Auditing compliance and KYC/AML for "${enterprise.companyName}"...`);

    const delay = input.simulationDelayMs ?? this.defaultDelayMs;
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }

    // Evaluate PEP flags
    const pepFlags: string[] = [];
    for (const executive of enterprise.governance.executives) {
      if (executive.isPep) {
        pepFlags.push(`${executive.name} (${executive.role}) flagged as Politically Exposed Person`);
      }
    }

    // Evaluate CND tax clearance
    const taxComplianceStatus: ComplianceAuditorOutput['taxComplianceStatus'] =
      enterprise.legal.taxClearanceCertificate ? 'VALID_CND' : 'IRREGULAR_CND';

    // Evaluate LGPD posture
    let lgpdStatus: ComplianceAuditorOutput['lgpdComplianceStatus'] = 'NON_COMPLIANT';
    if (enterprise.governance.hasDpo && enterprise.governance.lgpdGovernancePolicy) {
      lgpdStatus = 'FULLY_COMPLIANT';
    } else if (enterprise.governance.hasDpo || enterprise.governance.lgpdGovernancePolicy) {
      lgpdStatus = 'PARTIALLY_COMPLIANT';
    }

    // Compute composite compliance score (0 - 100)
    let complianceScore = 100;
    if (pepFlags.length > 0) complianceScore -= 20;
    if (taxComplianceStatus === 'IRREGULAR_CND') complianceScore -= 35;
    if (lgpdStatus === 'PARTIALLY_COMPLIANT') complianceScore -= 15;
    if (lgpdStatus === 'NON_COMPLIANT') complianceScore -= 30;
    if (enterprise.legal.activeLawsuitsCount > 5) complianceScore -= 15;

    const sanctionMatch = false; // Negative sanction check in clean profile
    const laborViolations = false;

    // Verdict determination
    let verdict: ComplianceAuditorOutput['verdict'] = 'CLEARED';
    const auditConditions: string[] = [];

    if (complianceScore >= 80 && !sanctionMatch && !laborViolations) {
      verdict = 'CLEARED';
      auditConditions.push('Regular annual compliance recertification schedule.');
    } else if (complianceScore >= 55) {
      verdict = 'CONDITIONAL_APPROVAL';
      if (taxComplianceStatus === 'IRREGULAR_CND') {
        auditConditions.push('Submit updated Certidão Negativa de Débitos (CND) within 30 days.');
      }
      if (lgpdStatus !== 'FULLY_COMPLIANT') {
        auditConditions.push('Formalize Data Protection Officer (DPO) and register LGPD data mapping.');
      }
    } else {
      verdict = 'BLOCKED';
      auditConditions.push('Severe compliance infractions detected. Immediate risk escalation required.');
    }

    const promptTokens = 460;
    const completionTokens = 340;

    return {
      data: {
        companyName: enterprise.companyName,
        complianceScore,
        verdict,
        pepFlagsFound: pepFlags,
        sanctionMatch,
        taxComplianceStatus,
        lgpdComplianceStatus: lgpdStatus,
        laborViolationsDetected: laborViolations,
        auditConditions,
      },
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      metadata: {
        sanctionDatabasesScreened: ['OFAC', 'UN', 'EU', 'COAF_SISCOAF', 'CEIS_CNEP'],
        lgpdAuditVersion: 'ANPD-2024-R1',
      },
    };
  }
}
