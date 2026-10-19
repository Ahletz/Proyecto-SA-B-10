// Parámetros de la simulación del procesador externo, ajustables en caliente (sin redeploy).
export interface SimulationSettings {
  failureRate: number; // 0..1 probabilidad de EXTERNAL_FAILURE
  timeoutRate: number; // 0..1 probabilidad de TIMEOUT
  timeoutMs: number; // espera antes de responder TIMEOUT
  latencyMs: number; // latencia añadida a toda llamada al procesador
}

const RANGES: Record<keyof SimulationSettings, [number, number]> = {
  failureRate: [0, 1],
  timeoutRate: [0, 1],
  timeoutMs: [0, 60_000],
  latencyMs: [0, 60_000],
};

export function parseSimulationPatch(input: unknown): { patch: Partial<SimulationSettings>; errors: string[] } {
  const patch: Partial<SimulationSettings> = {};
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { patch, errors: ['El cuerpo debe ser un objeto JSON'] };
  }
  for (const [key, value] of Object.entries(input)) {
    const range = RANGES[key as keyof SimulationSettings];
    if (!range) {
      errors.push(`Campo desconocido: ${key}`);
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1]) {
      errors.push(`${key} debe ser un número entre ${range[0]} y ${range[1]}`);
      continue;
    }
    patch[key as keyof SimulationSettings] = value;
  }
  return { patch, errors };
}

export function mergeSimulation(base: SimulationSettings, patch: Partial<SimulationSettings>): { settings: SimulationSettings; errors: string[] } {
  const settings = { ...base, ...patch };
  const errors: string[] = [];
  if (settings.failureRate + settings.timeoutRate > 1) errors.push('failureRate + timeoutRate no puede superar 1');
  return { settings, errors };
}
