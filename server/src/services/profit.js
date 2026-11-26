// PROFIT ENGINE
// Expected additional profit = extra revenue - extra fuel - toll - route deviation cost - handling - platform commission
import { round } from '../utils/geo.js';

export const COMMISSION_PCT = 5;
const HANDLING_FLAT = 50; // loading / unloading allowance
const LOAD_FUEL_PER_KG_KM = 0.002; // extra fuel burnt for carrying more weight (Rs per kg-km)

export function estimateProfit({ price, deviationKm = 0, shipmentKm = 0, weightKg = 0, costPerKm = 14, tollPerKm = 2.5 }) {
  const deviationCost = deviationKm * costPerKm; // extra driving to reach pickup/drop and rejoin the route
  const fuelCost = shipmentKm * weightKg * LOAD_FUEL_PER_KG_KM; // extra fuel for the added weight
  const tollCost = deviationKm * tollPerKm;
  const commission = (price * COMMISSION_PCT) / 100;
  const extraCosts = deviationCost + fuelCost + tollCost + HANDLING_FLAT;
  const netProfit = price - commission - extraCosts;
  return {
    revenue: round(price),
    deviationCost: round(deviationCost),
    fuelCost: round(fuelCost),
    tollCost: round(tollCost),
    handlingCost: HANDLING_FLAT,
    commission: round(commission),
    extraCosts: round(extraCosts),
    netProfit: round(netProfit)
  };
}

// A simple suggested price so customers have a sensible default.
export function suggestPrice(weightKg, km) {
  return Math.max(400, Math.round((km * weightKg * 0.015 + 150) / 10) * 10);
}

export function profitScore(netProfit, price) {
  if (price <= 0) return 0;
  const margin = netProfit / price; // share of the price the driver keeps
  return Math.max(0, Math.min(100, Math.round(margin * 100)));
}
