/**
 * Value Score Calculator
 * 
 * Value = Edge over the market
 * Formula: (Your confidence - Market implied probability) * adjustment factor
 * 
 * Higher value = better edge, even if confidence is lower
 * Example: 55% confidence on +150 underdog (40% implied) = 15% edge = high value
 *          75% confidence on -300 favorite (75% implied) = 0% edge = low value
 */

// Convert American odds to implied probability
export function oddsToImpliedProbability(americanOdds: number): number {
  if (americanOdds > 0) {
    // Underdog: +150 -> 100 / (150 + 100) = 40%
    return 100 / (americanOdds + 100);
  } else {
    // Favorite: -150 -> 150 / (150 + 100) = 60%
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}

// Convert spread to rough implied probability
// Generally, a spread bet is ~50% but we adjust for the points
export function spreadToImpliedProbability(spread: number): number {
  // Each point of spread is worth roughly 3% probability
  // 0 spread = 50%, -7 spread = ~71%, +7 spread = ~29%
  const adjustment = spread * -0.03;
  return Math.max(0.2, Math.min(0.8, 0.5 + adjustment));
}

// Parse spread from string like "Lakers -3.5" or "OKC +7"
export function parseSpread(spreadStr: string): number | null {
  const match = spreadStr.match(/([+-]?\d+\.?\d*)/);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

// Calculate value score (0-100)
// Higher = better value edge
export function calculateValueScore(confidence: number, impliedProb: number): number {
  // Edge = confidence - implied probability (as percentages)
  const confDecimal = confidence / 100;
  const edge = confDecimal - impliedProb;
  
  // Convert edge to 0-100 scale
  // -0.5 edge (terrible) -> 0
  // 0 edge (fair) -> 50
  // +0.5 edge (amazing) -> 100
  const valueScore = Math.max(0, Math.min(100, 50 + (edge * 100)));
  
  return Math.round(valueScore);
}

// Calculate value score from a game/bet object
export function calculateBetValue(bet: {
  confidence?: number;
  spread?: string;
  pick?: string;
  line?: string;
}): number {
  const confidence = bet.confidence || 60; // Default confidence
  
  // Try to extract spread from pick or spread field
  const spreadStr = bet.spread || bet.pick || bet.line || '';
  const spread = parseSpread(spreadStr);
  
  if (spread !== null) {
    const impliedProb = spreadToImpliedProbability(spread);
    return calculateValueScore(confidence, impliedProb);
  }
  
  // Default: assume 50% implied probability
  return calculateValueScore(confidence, 0.5);
}

// Format value score for display
export function formatValueScore(value: number): string {
  if (value >= 70) return `💎 ${value}`;      // High value
  if (value >= 55) return `📈 ${value}`;      // Good value  
  if (value >= 45) return `➖ ${value}`;      // Fair value
  return `📉 ${value}`;                        // Low value
}

// Get value tier text
export function getValueTier(value: number): string {
  if (value >= 75) return '💎💎💎 ELITE VALUE';
  if (value >= 65) return '💎💎 HIGH VALUE';
  if (value >= 55) return '💎 GOOD VALUE';
  if (value >= 45) return '➖ FAIR VALUE';
  return '📉 LOW VALUE';
}
