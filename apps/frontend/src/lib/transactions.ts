import {api} from './api';

export type TransactionStatus='PENDING'|'APPROVED'|'FAILED';

export interface TransactionHistoryItem{
  transactionId:string;
  sourceAccount:string;
  targetAccount:string;
  direction:'OUTGOING'|'INCOMING';
  amount:number;
  status:TransactionStatus;
  detailedStatus:string;
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
