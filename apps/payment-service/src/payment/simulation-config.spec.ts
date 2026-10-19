import { describe, expect, it } from 'vitest';
import { mergeSimulation, parseSimulationPatch } from './simulation-config';

const base = { failureRate: 0.1, timeoutRate: 0.05, timeoutMs: 3000, latencyMs: 0 };

describe('parseSimulationPatch', () => {
  it('acepta campos válidos', () => {
    expect(parseSimulationPatch({ failureRate: 0.5, latencyMs: 1200 })).toEqual({ patch: { failureRate: 0.5, latencyMs: 1200 }, errors: [] });
  });
  it('rechaza campos desconocidos, fuera de rango y tipos incorrectos', () => {
    const { patch, errors } = parseSimulationPatch({ foo: 1, failureRate: 2, timeoutMs: '5', latencyMs: -1 });
    expect(patch).toEqual({});
    expect(errors).toHaveLength(4);
  });
  it('rechaza cuerpos que no son objeto', () => {
    expect(parseSimulationPatch(null).errors).toHaveLength(1);
    expect(parseSimulationPatch([1]).errors).toHaveLength(1);
  });
});

describe('mergeSimulation', () => {
  it('aplica el parche sobre la base', () => {
    expect(mergeSimulation(base, { failureRate: 0.3 })).toEqual({ settings: { ...base, failureRate: 0.3 }, errors: [] });
  });
  it('no permite que las tasas sumen más de 1', () => {
    expect(mergeSimulation(base, { failureRate: 0.8, timeoutRate: 0.5 }).errors).toHaveLength(1);
  });
});
