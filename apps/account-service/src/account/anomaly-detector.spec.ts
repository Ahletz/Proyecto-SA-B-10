import { describe, expect, it } from 'vitest';
import { AnomalyDetector, anomalyConfigFromEnv } from './anomaly-detector';

const MIN = 60_000;
const detector = () => new AnomalyDetector({ maxOps: 3, windowMs: 10 * MIN });

describe('AnomalyDetector', () => {
  it('no alerta mientras no se supere el umbral', () => {
    const d = detector();
    expect([1, 2, 3].map((i) => d.record('a', i * 1000))).toEqual([null, null, null]);
  });

  it('alerta al superar N operaciones en la ventana, con el detalle', () => {
    const d = detector();
    [1, 2, 3].forEach((i) => d.record('a', i * 1000));
    expect(d.record('a', 4000)).toEqual({ accountId: 'a', operationCount: 4, threshold: 3, windowMinutes: 10 });
  });

  it('no repite la alerta dentro de la misma ventana', () => {
    const d = detector();
    [1, 2, 3, 4].forEach((i) => d.record('a', i * 1000));
    expect(d.record('a', 5000)).toBeNull();
  });

  it('las operaciones fuera de la ventana no cuentan', () => {
    const d = detector();
    [1, 2, 3].forEach((i) => d.record('a', i * 1000));
    expect(d.record('a', 11 * MIN)).toBeNull();
  });

  it('puede volver a alertar en una ventana posterior', () => {
    const d = detector();
    [1, 2, 3, 4].forEach((i) => d.record('a', i * 1000));
    [0, 1, 2].forEach((i) => d.record('a', 20 * MIN + i * 1000));
    expect(d.record('a', 20 * MIN + 5000)?.operationCount).toBe(4);
  });

  it('cada cuenta cuenta por separado', () => {
    const d = detector();
    [1, 2, 3].forEach((i) => d.record('a', i * 1000));
    expect(d.record('b', 4000)).toBeNull();
  });
});

describe('anomalyConfigFromEnv', () => {
  it('usa 5 operaciones en 10 minutos por defecto', () => {
    expect(anomalyConfigFromEnv({})).toEqual({ maxOps: 5, windowMs: 10 * MIN });
  });
  it('lee ANOMALY_MAX_OPS y ANOMALY_WINDOW_MINUTES', () => {
    expect(anomalyConfigFromEnv({ ANOMALY_MAX_OPS: '8', ANOMALY_WINDOW_MINUTES: '2' })).toEqual({ maxOps: 8, windowMs: 2 * MIN });
  });
  it('ignora valores inválidos', () => {
    expect(anomalyConfigFromEnv({ ANOMALY_MAX_OPS: 'x', ANOMALY_WINDOW_MINUTES: '-3' })).toEqual({ maxOps: 5, windowMs: 10 * MIN });
  });
});
