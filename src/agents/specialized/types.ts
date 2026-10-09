import { z } from 'zod';

export const RawDocumentInputSchema = z.object({
  documentId: z.string(),
  companyName: z.string(),
  rawText: z.string(),
  simulationDelayMs: z.number().optional(),
});
export type RawDocumentInput = z.infer<typeof RawDocumentInputSchema>;

export const ExtractedEnterpriseDataSchema = z.object({
  documentId: z.string(),
  cnpj: z.string(),
  companyName: z.string(),
  tradingName: z.string(),
  sector: z.string(),
  foundedYear: z.number(),
  financials: z.object({
    annualRevenue: z.number(),
    totalAssets: z.number(),
    equity: z.number(),
    currentAssets: z.number(),
    currentLiabilities: z.number(),
    longTermLiabilities: z.number(),
    netIncome: z.number(),
    ebitda: z.number(),
    operatingCashFlow: z.number(),
  }),
  governance: z.object({
    executives: z.array(
      z.object({
        name: z.string(),
        role: z.string(),
        isPep: z.boolean(),
      })
    ),
    hasDpo: z.boolean(),
    lgpdGovernancePolicy: z.boolean(),
  }),
  legal: z.object({
    activeLawsuitsCount: z.number(),
    taxClearanceCertificate: z.boolean(), // CND
  }),
});
export type ExtractedEnterpriseData = z.infer<typeof ExtractedEnterpriseDataSchema>;

export const FinancialRiskOutputSchema = z.object({
  companyName: z.string(),
  creditScore: z.number(), // 300 - 1000
  rating: z.enum(['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D']),
  liquidityRatio: z.number(),
  debtToEquityRatio: z.number(),
  altmanZScore: z.number(),
  defaultProbabilityPct: z.number(),
  riskCategory: z.enum(['LOW', 'MODERATE', 'ELEVATED', 'HIGH', 'CRITICAL']),
  maxRecommendedCreditBrl: z.number(),
  financialAlerts: z.array(z.string()),
});
export type FinancialRiskOutput = z.infer<typeof FinancialRiskOutputSchema>;

export const ComplianceAuditorOutputSchema = z.object({
  companyName: z.string(),
  complianceScore: z.number(), // 0 - 100
  verdict: z.enum(['CLEARED', 'CONDITIONAL_APPROVAL', 'BLOCKED']),
  pepFlagsFound: z.array(z.string()),
  sanctionMatch: z.boolean(),
  taxComplianceStatus: z.enum(['VALID_CND', 'IRREGULAR_CND', 'PENDING']),
  lgpdComplianceStatus: z.enum(['FULLY_COMPLIANT', 'PARTIALLY_COMPLIANT', 'NON_COMPLIANT']),
  laborViolationsDetected: z.boolean(),
  auditConditions: z.array(z.string()),
});
export type ComplianceAuditorOutput = z.infer<typeof ComplianceAuditorOutputSchema>;

export const ExecutiveSynthesisInputSchema = z.object({
  enterprise: ExtractedEnterpriseDataSchema,
  financialRisk: FinancialRiskOutputSchema,
  compliance: ComplianceAuditorOutputSchema,
  simulationDelayMs: z.number().optional(),
});
export type ExecutiveSynthesisInput = z.infer<typeof ExecutiveSynthesisInputSchema>;

export const ExecutiveSynthesisOutputSchema = z.object({
  dossierId: z.string(),
  evaluatedAt: z.string(),
  companyName: z.string(),
  cnpj: z.string(),
  finalDecision: z.enum(['APPROVED', 'APPROVED_WITH_CONDITIONS', 'REJECTED']),
  confidenceScore: z.number(), // 0.0 - 1.0
  executiveSummary: z.string(),
  creditFacilityGrantedBrl: z.number(),
  riskRating: z.string(),
  complianceVerdict: z.string(),
  mitigationRequirements: z.array(z.string()),
  auditTrail: z.object({
    extractorLatencyMs: z.number(),
    parallelAuditorsLatencyMs: z.number(),
    synthesisLatencyMs: z.number(),
    totalTokensUsed: z.number(),
  }),
});
export type ExecutiveSynthesisOutput = z.infer<typeof ExecutiveSynthesisOutputSchema>;
