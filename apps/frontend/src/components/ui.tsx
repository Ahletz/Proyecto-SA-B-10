import {ReactNode,useEffect,useState} from 'react';
import {Check,ChevronLeft,ChevronRight,Copy,LucideIcon} from 'lucide-react';
import {api} from '../lib/api';
import {accountLabel,shortId} from '../lib/format';

/* Encabezado estándar de página: ícono, título, descripción y acciones. */
export function PageHeader({
  icon:Icon,
  title,
  description,
  actions
}:{
  icon:LucideIcon;
  title:string;
  description?:string;
  actions?:ReactNode;
}){
  return(
    <div className="page-heading">
      <div className="page-title">
        <span className="page-icon"><Icon size={22} aria-hidden="true"/></span>
        <div>
          <h1>{title}</h1>
          {description&&<p className="muted">{description}</p>}
        </div>
      </div>
      {actions&&<div className="page-actions">{actions}</div>}
    </div>
  );
}

/* ID acortado con botón para copiar el valor completo. */
export function CopyId({value}:{value:string}){
  const[copied,setCopied]=useState(false);

  async function copy(){
    try{
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(()=>setCopied(false),1500);
    }catch{
      // Sin permiso de portapapeles: el ID completo sigue visible en el título.
    }
  }

  return(
    <span className="copy-id" title={value}>
      <code>{shortId(value)}</code>
      <button
        type="button"
        className="icon-button"
        onClick={()=>void copy()}
        aria-label={copied?'Copiado':'Copiar ID completo'}
        title={copied?'Copiado':'Copiar ID completo'}
      >
        {copied?<Check size={14}/>:<Copy size={14}/>}
      </button>
    </span>
  );
}

export function Badge({tone,children}:{tone:'success'|'warning'|'danger'|'info'|'neutral';children:ReactNode}){
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function EmptyState({icon:Icon,children}:{icon:LucideIcon;children:ReactNode}){
  return(
    <div className="card empty-state">
      <Icon size={28} aria-hidden="true"/>
      <p>{children}</p>
    </div>
  );
}

/* Tabla con scroll horizontal en pantallas angostas. */
export function TableWrap({children}:{children:ReactNode}){
  return <div className="table-wrap">{children}</div>;
}

export function Pagination({
  page,
  totalPages,
  total,
  noun,
  onChange,
  disabled
}:{
  page:number;
  totalPages:number;
  total:number;
  noun:string;
  onChange:(page:number)=>void;
  disabled?:boolean;
}){
  if(total===0){
    return null;
  }

  return(
    <div className="pagination">
      <button
        type="button"
        className="secondary"
        disabled={disabled||page<=1}
        onClick={()=>onChange(page-1)}
      >
        <ChevronLeft size={16} aria-hidden="true"/> Anterior
      </button>

      <span className="muted">
        Página {page} de {totalPages} · {total} {noun}
      </span>

      <button
        type="button"
        className="secondary"
        disabled={disabled||page>=totalPages}
        onClick={()=>onChange(page+1)}
      >
        Siguiente <ChevronRight size={16} aria-hidden="true"/>
      </button>
    </div>
  );
}

/* Página actual de una lista ya cargada (paginación en el navegador). */
export function paginate<T>(items:T[],page:number,size:number){
  const totalPages=Math.max(1,Math.ceil(items.length/size));
  const current=Math.min(page,totalPages);

  return{
    items:items.slice((current-1)*size,current*size),
    page:current,
    totalPages
  };
}

export interface CustomerOption{
  customerId:string;
  username:string;
  fullName:string;
  role:string;
  kycStatus:string;
}

/* Clientes (rol CLIENT) para que ADMIN y CASHIER elijan en vez de escribir un ID. */
export function useClientCustomers(enabled:boolean){
  const[customers,setCustomers]=useState<CustomerOption[]>([]);
  const[error,setError]=useState<string|null>(null);

  useEffect(()=>{
    if(!enabled){
      return;
    }

    api('/api/customers')
      .then((list:CustomerOption[])=>setCustomers(list.filter(c=>c.role==='CLIENT')))
      .catch(e=>setError(e instanceof Error?e.message:String(e)));
  },[enabled]);

  return{customers,error};
}

export function CustomerSelect({
  customers,
  value,
  onChange
}:{
  customers:CustomerOption[];
  value:string;
  onChange:(customerId:string)=>void;
}){
  return(
    <select value={value} onChange={e=>onChange(e.target.value)}>
      <option value="">Selecciona un cliente</option>
      {customers.map(c=>(
        <option key={c.customerId} value={c.customerId}>
          {c.fullName} · {c.username} ({c.customerId})
        </option>
      ))}
    </select>
  );
}

export interface AccountOption{
  accountId:string;
  type:string;
  availableBalance?:number|string;
  status?:string;
}

export function AccountSelect({
  accounts,
  value,
  onChange,
  emptyLabel='Sin cuentas',
  showBalance=false
}:{
  accounts:AccountOption[];
  value:string;
  onChange:(accountId:string)=>void;
  emptyLabel?:string;
  showBalance?:boolean;
}){
  return(
    <select
      value={value}
      onChange={e=>onChange(e.target.value)}
      disabled={accounts.length===0}
    >
      {accounts.length===0&&<option value="">{emptyLabel}</option>}
      {accounts.map(a=>(
        <option key={a.accountId} value={a.accountId}>
          {accountLabel(showBalance?a:{accountId:a.accountId,type:a.type})}
        </option>
      ))}
    </select>
  );
}
