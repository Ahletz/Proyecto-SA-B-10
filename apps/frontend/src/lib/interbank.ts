import {api,ApiError} from './api';
import {DetailedStatus} from './transactions';

// Bancos a los que se puede depositar (deben estar en INTERBANK_PARTNERS de Payment).
export const PARTNER_BANKS=[
  {code:'BANK13',label:'BANK13 · Banco pareja'},
  {code:'BANK99',label:'BANK99 · Banco simulado (pruebas)'}
];

// Mismo patrón que valida el API Gateway para la cuenta del otro banco.
export const DESTINATION_ACCOUNT_PATTERN=/^[A-Za-z0-9-]{1,34}$/;

// Estado del depósito frente al banco pareja (Transaction Service, InterbankState).
export type InterbankState='PENDING'|'SENT'|'TIMEOUT'|'ACCEPTED'|'REJECTED'|'REVERSED';

export interface InterbankTransfer{
  transactionId:string;
  sourceAccount:string;
  targetAccount:string;
  amount:number;
  status:DetailedStatus;
  failureReason?:string|null;
  correlationId:string;
  destinationBankCode:string|null;
  interbankState:InterbankState|null;
  createdAt:string;
  updatedAt:string;
}

export interface InterbankAccepted{
  accepted:boolean;
  correlationId:string;
  eventId:string;
  traceId?:string;
  status:'PENDING';
}

export const INTERBANK_STATE_LABELS:Record<InterbankState,string>={
  PENDING:'Pendiente',
  SENT:'Enviado al otro banco',
  TIMEOUT:'Sin respuesta, consultando',
  ACCEPTED:'Aceptado por el otro banco',
  REJECTED:'Rechazado · fondos devueltos',
  REVERSED:'Revertido · fondos devueltos'
};

// Transaction guarda los motivos del banco pareja y de Payment con prefijo INTERBANK_.
const INTERBANK_REASON_LABELS:Record<string,string>={
  KYC_NOT_VERIFIED:'Cliente sin verificación KYC',
  INSUFFICIENT_FUNDS:'Fondos insuficientes',
  AMOUNT_LIMIT_EXCEEDED:'Monto sobre el límite interbancario',
  ACCOUNT_NOT_FOUND:'La cuenta no existe en el otro banco',
  ACCOUNT_INACTIVE:'La cuenta está inactiva en el otro banco',
  REJECTED:'El otro banco rechazó el depósito',
  EXPIRED:'El depósito venció antes de procesarse',
  TIMEOUT:'El otro banco no respondió a tiempo',
  TIMEOUT_NO_RESPONSE:'El otro banco no respondió a tiempo',
  PROCESSING_ERROR:'Error al comunicarse con el otro banco'
};

export function interbankReasonLabel(reason:string){
  return INTERBANK_REASON_LABELS[reason.replace(/^INTERBANK_/,'')]??reason;
}

/*
 * Final cuando la Saga terminó (COMPLETED, FAILED o COMPENSATED). Un
 * TIMEOUT no es final: Payment consulta y cancela, y termina en REVERSED.
 */
export function isInterbankFinal(t:InterbankTransfer){
  return t.status==='COMPLETED'||t.status==='FAILED'||t.status==='COMPENSATED';
}

export function createInterbankTransfer(body:{
  sourceAccount:string;
  destinationBankCode:string;
  destinationAccount:string;
  amount:string;
  description?:string;
}):Promise<InterbankAccepted>{
  return api('/api/interbank-transfers',{
    method:'POST',
    body:JSON.stringify(body)
  });
}

// null mientras Transaction Service todavía no consume la solicitud (404).
export async function fetchInterbankTransfer(
  correlationId:string
):Promise<InterbankTransfer|null>{
  try{
    return await api(`/api/interbank-transfers/${encodeURIComponent(correlationId)}`);
  }catch(e){
    if(e instanceof ApiError&&e.status===404){
      return null;
    }

    throw e;
  }
}
