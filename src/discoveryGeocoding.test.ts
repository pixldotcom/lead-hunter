import { describe, expect, it } from 'vitest';
import { selectGeocodedCenter } from '../api/discover';

describe('discovery locality geocoding', () => {
  it('uses an exact city match when a location includes a region or country', () => {
    expect(selectGeocodedCenter('Ludhiana, Punjab, India', [
      { geometry: { coordinates: [77.2, 28.6] }, properties: { name: 'Delhi', city: 'Delhi' } },
      { geometry: { coordinates: [75.85, 30.9] }, properties: { name: 'Ludhiana', city: 'Ludhiana' } },
    ])).toEqual({ lat: 30.9, lon: 75.85 });
  });

  it('does not choose an arbitrary result for an ambiguous locality', () => {
    expect(selectGeocodedCenter('Springfield, Illinois', [
      { geometry: { coordinates: [-72.6, 42.1] }, properties: { name: 'Springfield', city: 'Springfield', country: 'United States' } },
      { geometry: { coordinates: [-89.6, 39.8] }, properties: { name: 'Springfield', city: 'Springfield', country: 'United States' } },
    ])).toBeNull();
  });

  it('returns null when Photon has no matching place or valid coordinates', () => {
    expect(selectGeocodedCenter('Ludhiana', [
      { geometry: { coordinates: [77.2, 28.6] }, properties: { name: 'Delhi' } },
    ])).toBeNull();
    expect(selectGeocodedCenter('Ludhiana', [
      { geometry: { coordinates: [NaN, 28.6] }, properties: { name: 'Ludhiana' } },
    ])).toBeNull();
  });

  it('matches Unicode place names without diacritics', () => {
    expect(selectGeocodedCenter('Sao Paulo, Brazil', [
      { geometry: { coordinates: [-46.63, -23.55] }, properties: { name: 'São Paulo' } },
    ])).toEqual({ lat: -23.55, lon: -46.63 });
  });
});
