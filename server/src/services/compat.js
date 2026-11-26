// CARGO ENGINE (compatibility part)
// Checks whether a new shipment can safely travel in this vehicle together with what is already on the trip.

const COVERED = ['container', 'closed', 'refrigerated'];
const NEEDS_COVER = ['electronics', 'pharma', 'textiles', 'fmcg', 'food_perishable', 'furniture'];
const FOOD_LIKE = ['food_perishable', 'pharma', 'fmcg', 'agricultural'];

export function cargoCompatibility(vehicle, shipment, existingCargo = []) {
  const reasons = [];
  const cat = shipment.category || 'general';

  if (cat === 'food_perishable' && vehicle.type !== 'refrigerated') {
    reasons.push('Perishable goods need a refrigerated vehicle');
  }
  if (cat === 'pharma' && !['refrigerated', 'closed'].includes(vehicle.type)) {
    reasons.push('Pharma needs a closed or refrigerated vehicle');
  }
  if (NEEDS_COVER.includes(cat) && !COVERED.includes(vehicle.type) && !reasons.length) {
    reasons.push(`${cat.replace('_', ' ')} needs a covered vehicle`);
  }
  if (vehicle.type === 'tanker' && cat !== 'hazardous') {
    reasons.push('Tanker can only carry liquids/chemicals');
  }

  const others = existingCargo.filter((c) => c.status !== 'delivered');
  if (cat === 'hazardous' && others.some((c) => FOOD_LIKE.includes(c.category))) {
    reasons.push('Hazardous goods cannot travel with food, FMCG or pharma cargo');
  }
  if (FOOD_LIKE.includes(cat) && others.some((c) => c.category === 'hazardous')) {
    reasons.push('This cargo cannot travel with hazardous goods already on board');
  }

  return { compatible: reasons.length === 0, reasons };
}
