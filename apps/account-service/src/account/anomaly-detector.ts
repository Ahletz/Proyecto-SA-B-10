// Detección simple de actividad anómala: más de N operaciones en M minutos desde una misma cuenta.
// Configurable por variables de entorno (ConfigMap): ANOMALY_MAX_OPS y ANOMALY_WINDOW_MINUTES.
export interface AnomalyConfig {
  maxOps: number;
  windowMs: number;
}

export interface Anomaly {
  accountId: string;
  operationCount: number;
  threshold: number;
  windowMinutes: number;
}

const DEFAULT_MAX_OPS = 5;
const DEFAULT_WINDOW_MINUTES = 10;

export function anomalyConfigFromEnv(env: Record<string, string | undefined> = process.env): AnomalyConfig {
  const maxOps = Number(env.ANOMALY_MAX_OPS ?? DEFAULT_MAX_OPS);
  const minutes = Number(env.ANOMALY_WINDOW_MINUTES ?? DEFAULT_WINDOW_MINUTES);
  return {
    maxOps: Number.isFinite(maxOps) && maxOps >= 1 ? Math.floor(maxOps) : DEFAULT_MAX_OPS,
    windowMs: (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_WINDOW_MINUTES) * 60_000,
  };
}

export class AnomalyDetector {
  private readonly hits = new Map<string, number[]>();
  private readonly lastAlert = new Map<string, number>();

  constructor(private readonly config: AnomalyConfig = anomalyConfigFromEnv()) {}

  // Registra una operación. Devuelve la anomalía solo la primera vez que se cruza el umbral
  // dentro de una ventana (no repite la alerta por cada operación siguiente).
  record(accountId: string, now = Date.now()): Anomaly | null {
    const { maxOps, windowMs } = this.config;
    const recent = (this.hits.get(accountId) ?? []).filter((t) => t > now - windowMs);
    recent.push(now);
    this.hits.set(accountId, recent);
    if (this.hits.size > 10_000) this.sweep(now);

    if (recent.length <= maxOps) return null;
    const last = this.lastAlert.get(accountId);
    if (last !== undefined && now - last < windowMs) return null;
    this.lastAlert.set(accountId, now);
    return { accountId, operationCount: recent.length, threshold: maxOps, windowMinutes: windowMs / 60_000 };
  }

  private sweep(now: number) {
    const from = now - this.config.windowMs;
    for (const [id, list] of this.hits) {
      if (!list.some((t) => t > from)) this.hits.delete(id);
    }
    for (const [id, t] of this.lastAlert) {
      if (t <= from) this.lastAlert.delete(id);
    }
  }
}
