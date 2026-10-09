import { AgentContext } from '../base/agent.interface.js';
import { BaseAgent } from '../base/base-agent.js';
import {
  ExtractedEnterpriseData,
  FinancialRiskOutput,
  FinancialRiskOutputSchema,
} from './types.js';

export interface FinancialRiskInput {
  enterprise: ExtractedEnterpriseData;
  simulationDelayMs?: number;
}

/**
 * Specialized Agent for quantitative solvency evaluation, credit scoring,
 * liquidity ratio analysis, and Altman Z-Score default modeling.
 */
export class FinancialRiskAgent extends BaseAgent<FinancialRiskInput, FinancialRiskOutput> {
  constructor(defaultDelayMs = 140) {
    super({
      metadata: {
        id: 'agent.financial-risk',
        name: 'FinancialRiskAgent',
        version: '2.1.0',
        description:
          'Calculates solvency ratios, Altman Z-Score, debt-to-equity leverage, and credit limits for corporate underwriting.',
        author: 'Lucas Calado',
        tags: ['finance', 'credit-risk', 'underwriting', 'solvency'],
      },
      outputSchema: FinancialRiskOutputSchema,
    });
    this.defaultDelayMs = defaultDelayMs;
  }

  private readonly defaultDelayMs: number;

  protected async process(
    input: FinancialRiskInput,
    context: AgentContext
  ): Promise<{
    data: FinancialRiskOutput;
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
    metadata?: Record<string, unknown>;
  }> {
    const { enterprise } = input;
    context.logger.info(`[FinancialRiskAgent] Conducting quantitative risk analysis on "${enterprise.companyName}"...`);

    const delay = input.simulationDelayMs ?? this.defaultDelayMs;
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }

    const fin = enterprise.financials;

    // Financial formulas
    // Liquidity Ratio (Current Assets / Current Liabilities)
    const liquidityRatio = Number((fin.currentAssets / Math.max(1, fin.currentLiabilities)).toFixed(2));

    // Debt to Equity ((Current Liabilities + Long Term Liabilities) / Equity)
    const totalDebt = fin.currentLiabilities + fin.longTermLiabilities;
    const debtToEquityRatio = Number((totalDebt / Math.max(1, fin.equity)).toFixed(2));

    // Emerging Market Altman Z-Score (EM-Score) approx:
    // Z = 3.25 + 6.56*X1 + 3.26*X2 + 6.72*X3 + 1.05*X4
    // X1 = Working Capital / Total Assets
    // X2 = Retained Earnings / Total Assets (approximated by Net Income / Total Assets)
    // X3 = EBIT / Total Assets
    // X4 = Book Value of Equity / Total Liabilities
    const workingCapital = fin.currentAssets - fin.currentLiabilities;
    const x1 = workingCapital / fin.totalAssets;
    const x2 = fin.netIncome / fin.totalAssets;
    const x3 = fin.ebitda / fin.totalAssets;
    const x4 = fin.equity / totalDebt;

    const rawZ = 3.25 + 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
    const altmanZScore = Number(rawZ.toFixed(2));

    // Credit score derivation (300 to 1000 scale)
    let baseScore = 650;
    if (liquidityRatio >= 1.8) baseScore += 90;
    else if (liquidityRatio >= 1.3) baseScore += 50;
    else if (liquidityRatio < 1.0) baseScore -= 120;

    if (debtToEquityRatio < 1.2) baseScore += 80;
    else if (debtToEquityRatio > 2.5) baseScore -= 90;

    if (altmanZScore > 5.85) baseScore += 70; // Safe zone
    else if (altmanZScore < 4.15) baseScore -= 110; // Distress zone

    const creditScore = Math.max(300, Math.min(1000, Math.round(baseScore)));

    // Rating bracket
    let rating: FinancialRiskOutput['rating'] = 'BBB';
    let riskCategory: FinancialRiskOutput['riskCategory'] = 'MODERATE';
    let defaultProbabilityPct = 3.5;

    if (creditScore >= 880) {
      rating = 'AAA';
      riskCategory = 'LOW';
      defaultProbabilityPct = 0.4;
    } else if (creditScore >= 800) {
      rating = 'AA';
      riskCategory = 'LOW';
      defaultProbabilityPct = 0.9;
    } else if (creditScore >= 740) {
      rating = 'A';
      riskCategory = 'LOW';
      defaultProbabilityPct = 1.8;
    } else if (creditScore >= 670) {
      rating = 'BBB';
      riskCategory = 'MODERATE';
      defaultProbabilityPct = 3.2;
    } else if (creditScore >= 590) {
      rating = 'BB';
      riskCategory = 'ELEVATED';
      defaultProbabilityPct = 6.8;
    } else if (creditScore >= 500) {
      rating = 'B';
      riskCategory = 'HIGH';
      defaultProbabilityPct = 12.5;
    } else {
      rating = 'D';
      riskCategory = 'CRITICAL';
      defaultProbabilityPct = 28.0;
    }

    // Recommended maximum credit line: ~15% of annual revenue scaled by liquidity
    const maxRecommendedCreditBrl = Math.round((fin.annualRevenue * 0.15 * (creditScore / 800)) / 100_000) * 100_000;

    const alerts: string[] = [];
    if (debtToEquityRatio > 1.5) {
      alerts.push(`High leverage detected: Debt-to-Equity is ${debtToEquityRatio}x (threshold: 1.5x)`);
    }
    if (liquidityRatio < 1.3) {
      alerts.push(`Tight short-term liquidity: Current Ratio is ${liquidityRatio}`);
    }
    if (alerts.length === 0) {
      alerts.push('Healthy capital structure and resilient cash generation profile.');
    }

    const promptTokens = 520;
    const completionTokens = 410;

    return {
      data: {
        companyName: enterprise.companyName,
        creditScore,
        rating,
        liquidityRatio,
        debtToEquityRatio,
        altmanZScore,
        defaultProbabilityPct,
        riskCategory,
        maxRecommendedCreditBrl,
        financialAlerts: alerts,
      },
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      metadata: {
        scoringModel: 'altman-z-em-credit-v2',
        workingCapitalBrl: workingCapital,
      },
    };
  }
}
