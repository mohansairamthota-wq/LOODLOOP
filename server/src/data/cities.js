// Gazetteer of cities used for route planning (Andhra Pradesh, Telangana and nearby).
// Coordinates are approximate city centres. Add more cities here to extend coverage.
export const CITIES = [
  { name: 'Eluru', lat: 16.7107, lng: 81.0952 },
  { name: 'Vijayawada', lat: 16.5062, lng: 80.648 },
  { name: 'Guntur', lat: 16.3067, lng: 80.4365 },
  { name: 'Hyderabad', lat: 17.385, lng: 78.4867 },
  { name: 'Rajahmundry', lat: 17.0005, lng: 81.804 },
  { name: 'Visakhapatnam', lat: 17.6868, lng: 83.2185 },
  { name: 'Kakinada', lat: 16.9891, lng: 82.2475 },
  { name: 'Bhimavaram', lat: 16.5449, lng: 81.5212 },
  { name: 'Machilipatnam', lat: 16.1875, lng: 81.1389 },
  { name: 'Gudivada', lat: 16.435, lng: 80.993 },
  { name: 'Nuzvid', lat: 16.788, lng: 80.846 },
  { name: 'Tenali', lat: 16.243, lng: 80.64 },
  { name: 'Narasaraopet', lat: 16.2352, lng: 80.049 },
  { name: 'Ongole', lat: 15.5057, lng: 80.0499 },
  { name: 'Nellore', lat: 14.4426, lng: 79.9865 },
  { name: 'Tirupati', lat: 13.6288, lng: 79.4192 },
  { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { name: 'Kurnool', lat: 15.8281, lng: 78.0373 },
  { name: 'Kadapa', lat: 14.4673, lng: 78.8242 },
  { name: 'Anantapur', lat: 14.6819, lng: 77.6006 },
  { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
  { name: 'Khammam', lat: 17.2473, lng: 80.1514 },
  { name: 'Suryapet', lat: 17.1405, lng: 79.6236 },
  { name: 'Nalgonda', lat: 17.0575, lng: 79.269 },
  { name: 'Warangal', lat: 17.9689, lng: 79.5941 }
];

const byName = new Map(CITIES.map((c) => [c.name.toLowerCase(), c]));

export function findCity(name) {
  if (!name) return null;
  return byName.get(String(name).trim().toLowerCase()) || null;
}

// Accepts a city name string or a {name, lat, lng} object and returns a point.
export function resolvePlace(input) {
  if (!input) return null;
  if (typeof input === 'string') return findCity(input);
  if (typeof input.lat === 'number' && typeof input.lng === 'number') {
    return { name: input.name || 'Custom point', lat: input.lat, lng: input.lng };
  }
  return findCity(input.name);
}
