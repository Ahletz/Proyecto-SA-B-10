import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InterbankService } from './interbank.service';

// Ejecuta el trabajo en segundo plano del módulo interbancario (envíos pendientes, protocolo de timeout, callbacks con
// reintentos, reversos, outbox de eventos) y la conciliación diaria. INTERBANK_WORKER_ENABLED=false lo apaga (pruebas).
@Injectable()
export class InterbankWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InterbankWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastReconciled = '';

  constructor(private readonly service: InterbankService, private readonly config: ConfigService) {}

  onModuleInit() {
    if (this.config.get('INTERBANK_WORKER_ENABLED', 'true') === 'false') return;
    const every = Number(this.config.get('INTERBANK_TICK_MS', '2000'));
    this.timer = setInterval(() => void this.run(), every);
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.service.tick();
      await this.reconcileYesterday();
    } catch (e) {
      this.logger.error({ message: 'Falló el ciclo del worker interbancario', event: 'interbank.worker_error', error: String(e) });
    } finally {
      this.running = false;
    }
  }

  // Una vez al día (después de 01:00 UTC) se concilia el día anterior con cada banco pareja.
  private async reconcileYesterday() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
    if (now.getUTCHours() < 1 || this.lastReconciled === yesterday || !/^BANK\d{2}$/.test(this.config.get('INTERBANK_BANK_CODE', ''))) return;
    this.lastReconciled = yesterday;
    await this.service.reconcile(yesterday);
  }
}
