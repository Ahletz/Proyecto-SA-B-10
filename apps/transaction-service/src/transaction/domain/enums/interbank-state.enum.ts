/**
 * Estados del depósito interbancario saliente (Fase 3, docs/interbank/diseno-interbancario.md §5).
 * Conviven con TransactionStatus: este es el estado frente al banco pareja y
 * TransactionStatus el de la Saga dentro del banco.
 */
export enum InterbankState {
  PENDING = 'PENDING',
  SENT = 'SENT',
  TIMEOUT = 'TIMEOUT',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  REVERSED = 'REVERSED',
}

/**
 * Los eventos pueden llegar fuera de orden (por ejemplo `timeout` después de
 * `accepted`): un estado de etapa igual o anterior a la actual se ignora, y un
 * estado final (ACCEPTED, REJECTED, REVERSED) nunca se sobrescribe.
 */
export const INTERBANK_STAGE: Record<InterbankState, number> = {
  [InterbankState.PENDING]: 0,
  [InterbankState.SENT]: 1,
  [InterbankState.TIMEOUT]: 2,
  [InterbankState.ACCEPTED]: 3,
  [InterbankState.REJECTED]: 3,
  [InterbankState.REVERSED]: 3,
};

export function isFinalInterbankState(
  state: InterbankState | null,
): boolean {
  return state !== null && INTERBANK_STAGE[state] === 3;
}
