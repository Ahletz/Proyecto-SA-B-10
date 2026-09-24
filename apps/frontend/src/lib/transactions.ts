import {api,ApiError} from './api';

export type TransactionStatus='PENDING'|'APPROVED'|'FAILED';

export interface TransactionHistoryItem{
  transactionId:string;
  sourceAccount:string;
  targetAccount:string;
  direction:'OUTGOING'|'INCOMING';
  amount:number;
  status:TransactionStatus;
  detailedStatus:string;
  failureReason?:string|null;
  correlationId:string;
  createdAt:string;
  updatedAt:string;
}

export interface TransactionHistoryPage{
  items:TransactionHistoryItem[];
  page:number;
  size:number;
  total:number;
}

export interface TransactionHistoryFilters{
  accountId:string;
  /* Fechas del input type="date" (YYYY-MM-DD) en hora local. */
  from?:string;
  to?:string;
  status?:TransactionStatus|'';
  page:number;
  size:number;
}

/*
 * El rango de fechas se envía en ISO-8601 cubriendo el día
 * completo en la zona horaria del navegador.
 */
export function buildHistoryQuery(filters:TransactionHistoryFilters){
  const params=new URLSearchParams({
    accountId:filters.accountId,
    page:String(filters.page),
    size:String(filters.size)
  });

  if(filters.from){
    params.set('from',new Date(`${filters.from}T00:00:00`).toISOString());
  }

  if(filters.to){
    params.set('to',new Date(`${filters.to}T23:59:59.999`).toISOString());
  }

  if(filters.status){
    params.set('status',filters.status);
  }

  return params.toString();
}

export function fetchTransactionHistory(
  filters:TransactionHistoryFilters
):Promise<TransactionHistoryPage>{
  return api(`/api/transactions?${buildHistoryQuery(filters)}`);
}

// Motivos que guarda Transaction Service cuando la Saga falla o compensa.
const FAILURE_REASON_LABELS:Record<string,string>={
  KYC_NOT_VERIFIED:'Cliente sin verificación KYC',
  INSUFFICIENT_FUNDS:'Fondos insuficientes',
  ACCOUNT_NOT_FOUND_OR_INACTIVE:'Cuenta inexistente o inactiva',
  PAYMENT_TIMEOUT:'El procesador de pagos no respondió',
  PAYMENT_EXTERNAL_FAILURE:'Rechazada por el procesador de pagos',
  PAYMENT_LIMIT_EXCEEDED:'Monto sobre el límite de pago',
  PAYMENT_INVALID_AMOUNT:'Monto inválido',
  PAYMENT_REJECTED:'Pago rechazado'
};

export function failureReasonLabel(reason:string){
  return FAILURE_REASON_LABELS[reason]??reason;
}

// Estados internos de la Saga (Transaction Service).
export type DetailedStatus=
  'PENDING'|'PROCESSING'|'COMPLETED'|'FAILED'|'COMPENSATING'|'COMPENSATED';

export interface TransferStatus{
  transactionId:string;
  sourceAccount:string;
  targetAccount:string;
  amount:number;
  status:DetailedStatus;
  failureReason?:string|null;
  correlationId:string;
  createdAt:string;
  updatedAt:string;
}

export interface TransferAccepted{
  accepted:boolean;
  correlationId:string;
  eventId:string;
  status:'PENDING';
}

export const DETAILED_STATUS_LABELS:Record<DetailedStatus,string>={
  PENDING:'Pendiente',
  PROCESSING:'Procesando pago',
  COMPLETED:'Completada',
  FAILED:'Fallida',
  COMPENSATING:'Revirtiendo fondos',
  COMPENSATED:'Fallida · fondos devueltos'
};

const TERMINAL_STATUSES:DetailedStatus[]=['COMPLETED','FAILED','COMPENSATED'];

export function isTerminalStatus(status:DetailedStatus){
  return TERMINAL_STATUSES.includes(status);
}

// Mismo mapeo que el evento transaction.status.changed (decisión 1).
export function publicStatus(status:DetailedStatus):TransactionStatus{
  if(status==='COMPLETED'){
    return 'APPROVED';
  }

  return status==='FAILED'||status==='COMPENSATED'?'FAILED':'PENDING';
}

export function createTransfer(body:{
  sourceAccount:string;
  targetAccount:string;
  amount:number;
}):Promise<TransferAccepted>{
  return api('/api/transfers',{
    method:'POST',
    body:JSON.stringify(body)
  });
}

/*
 * Devuelve null mientras Transaction Service todavía no consume el
 * evento transaction.transfer.requested (responde 404).
 */
export async function fetchTransferStatus(
  correlationId:string
):Promise<TransferStatus|null>{
  try{
    return await api(`/api/transfers/${correlationId}`);
  }catch(e){
    if(e instanceof ApiError&&e.status===404){
      return null;
    }

    throw e;
  }
}
