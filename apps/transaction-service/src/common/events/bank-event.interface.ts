export interface BankEvent<TPayload = unknown> {
  eventId: string;
  eventType: string;
  version: number;
  timestamp: string;
  correlationId: string;
  payload: TPayload;
}
