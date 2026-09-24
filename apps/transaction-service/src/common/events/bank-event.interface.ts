export interface BankEvent<TPayload = unknown> {
  eventId: string;
  eventType: string;
  version: number;
  timestamp: string;
  correlationId: string;
  // eventId del evento que disparó este (contrato 2.1, opcional)
  causationId?: string;
  payload: TPayload;
}
