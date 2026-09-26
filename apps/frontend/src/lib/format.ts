/*
 * Formato y etiquetas compartidas por las páginas: montos, fechas, IDs y
 * los valores que el backend devuelve en inglés (ACTIVE, CLIENT, MONETARY...).
 */

const MONEY=new Intl.NumberFormat('es-GT',{
  minimumFractionDigits:2,
  maximumFractionDigits:2
});

const DATE_TIME=new Intl.DateTimeFormat('es-GT',{
  dateStyle:'medium',
  timeStyle:'short'
});

export function formatMoney(value:number|string|null|undefined){
  const amount=Number(value??0);

  return `Q${MONEY.format(Number.isFinite(amount)?amount:0)}`;
}

export function formatDateTime(value?:string|null){
  if(!value){
    return '—';
  }

  const date=new Date(value);

  return Number.isNaN(date.getTime())?value:DATE_TIME.format(date);
}

export function shortId(id:string){
  return id.length>13?`${id.slice(0,8)}…${id.slice(-4)}`:id;
}

export const ACCOUNT_TYPE_LABELS:Record<string,string>={
  MONETARY:'Monetaria',
  SAVINGS:'Ahorro'
};

export const ACCOUNT_STATUS_LABELS:Record<string,string>={
  ACTIVE:'Activa',
  INACTIVE:'Inactiva'
};

export const CUSTOMER_STATUS_LABELS:Record<string,string>={
  ACTIVE:'Activa',
  PENDING_ACTIVATION:'Pendiente de activación'
};

export const IDENTITY_LABELS:Record<string,string>={
  VALIDATED:'Validada',
  PENDING:'Pendiente'
};

export const ROLE_LABELS:Record<string,string>={
  ADMIN:'Administrador',
  CASHIER:'Cajero',
  CLIENT:'Cliente'
};

export const KYC_LABELS:Record<string,string>={
  PENDING:'Pendiente',
  VERIFIED:'Verificado',
  REJECTED:'Rechazado'
};

export function label(map:Record<string,string>,value?:string|null){
  return value?map[value]??value:'—';
}

export function accountLabel(account:{accountId:string;type:string;availableBalance?:number|string}){
  const base=`${label(ACCOUNT_TYPE_LABELS,account.type)} · ${shortId(account.accountId)}`;

  return account.availableBalance===undefined
    ?base
    :`${base} · Disponible ${formatMoney(account.availableBalance)}`;
}
