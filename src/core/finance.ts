export interface MonthlySettlementInput {
  revenue: number;
  infrastructureCost: number;
  aiCost: number;
}

export interface MonthlySettlementResult {
  cash: number;
  bankrupt: boolean;
  revenue: number;
  totalCost: number;
  profit: number;
}

export class RevenuePolicy {
  static readonly BASE_REVENUE_PER_AVG_DAU = 20;
  static readonly AI_COST_PER_AVG_DAU = 1.5;
  static readonly EXIT_MONTHLY_REVENUE_TARGET = 900_000_000;

  static monthlyRevenue(averageDau: number, additiveModifier = 0): number {
    return Math.round(averageDau * this.BASE_REVENUE_PER_AVG_DAU * (1 + additiveModifier));
  }

  static monthlyAiCost(averageDau: number, aiFeatureActive: boolean): number {
    return aiFeatureActive ? Math.round(averageDau * this.AI_COST_PER_AVG_DAU) : 0;
  }
}

export class FinanceAccount {
  private _cash: number;

  constructor(startingCash = 3_000_000) {
    this._cash = startingCash;
  }

  get cash(): number { return this._cash; }
  get bankrupt(): boolean { return this._cash < 0; }

  spendImmediately(amount: number): void {
    if (amount < 0) throw new Error('Spend amount must be positive');
    if (amount > this._cash) throw new Error('Insufficient cash');
    this._cash -= amount;
  }

  settleMonth(input: MonthlySettlementInput): MonthlySettlementResult {
    const totalCost = input.infrastructureCost + input.aiCost;
    this._cash += input.revenue;
    this._cash -= totalCost;

    return {
      cash: this._cash,
      bankrupt: this._cash < 0,
      revenue: input.revenue,
      totalCost,
      profit: input.revenue - totalCost,
    };
  }
}

export class MonthlyDauLedger {
  private dauTotal = 0;
  private days = 0;

  recordDay(dau: number): void {
    this.dauTotal += dau;
    this.days += 1;
  }

  get averageDau(): number {
    return this.days === 0 ? 0 : this.dauTotal / this.days;
  }

  reset(): void {
    this.dauTotal = 0;
    this.days = 0;
  }
}
