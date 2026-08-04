/**
 * Fixed assets — depreciation, disposal, revaluation helpers
 */

import type { DepreciationMethod } from "./types";

export interface AssetInput {
  cost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  method: DepreciationMethod;
  accumulatedDepreciation?: number;
  unitsProduced?: number;
  totalEstimatedUnits?: number;
}

export function monthlyDepreciation(asset: AssetInput): number {
  const cost = asset.cost;
  const salvage = asset.salvageValue;
  const life = Math.max(1, asset.usefulLifeMonths);
  const accum = asset.accumulatedDepreciation ?? 0;
  const book = cost - accum;

  if (book <= salvage) return 0;

  if (asset.method === "straight_line") {
    return Math.round(((cost - salvage) / life) * 100) / 100;
  }

  if (asset.method === "declining_balance") {
    const rate = 2 / (life / 12); // double-declining annual → monthly approx
    const monthly = (book * rate) / 12;
    return Math.round(Math.min(monthly, book - salvage) * 100) / 100;
  }

  // units of production
  const units = asset.unitsProduced ?? 0;
  const total = Math.max(1, asset.totalEstimatedUnits ?? 1);
  const perUnit = (cost - salvage) / total;
  return Math.round(Math.min(perUnit * units, book - salvage) * 100) / 100;
}

export function disposalGainLoss(
  cost: number,
  accumDep: number,
  proceeds: number
): { bookValue: number; gainLoss: number } {
  const bookValue = Math.round((cost - accumDep) * 100) / 100;
  const gainLoss = Math.round((proceeds - bookValue) * 100) / 100;
  return { bookValue, gainLoss };
}

export function revaluedAmount(
  bookValue: number,
  fairValue: number
): { revaluationSurplus: number; impairment: number } {
  const delta = Math.round((fairValue - bookValue) * 100) / 100;
  return {
    revaluationSurplus: delta > 0 ? delta : 0,
    impairment: delta < 0 ? -delta : 0,
  };
}
