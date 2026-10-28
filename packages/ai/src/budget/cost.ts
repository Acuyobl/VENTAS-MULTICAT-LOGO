export interface AiPricing {
  usdPer1kInput: number;
  usdPer1kOutput: number;
}

export function computeCostMicroUsd(
  tokensIn: number,
  tokensOut: number,
  pricing: AiPricing,
): number {
  const input = (tokensIn / 1000) * pricing.usdPer1kInput * 1_000_000;
  const output = (tokensOut / 1000) * pricing.usdPer1kOutput * 1_000_000;
  return Math.round(input + output);
}
