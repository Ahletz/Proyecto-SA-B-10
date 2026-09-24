import {useCallback,useEffect,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {api} from '../lib/api';
import {
  TransactionHistoryItem,
  TransactionHistoryPage as HistoryPage,
  TransactionStatus,
  failureReasonLabel,
  fetchTransactionHistory
} from '../lib/transactions';
import {useAuthStore} from '../store/authStore';

const PAGE_SIZE=20;

const STATUS_LABELS:Record<TransactionStatus,string>={
  PENDING:'Pendiente',
  APPROVED:'Aprobada',
  FAILED:'Fallida'
};

interface Account{
  accountId:string;
  type:string;
}

function formatDate(value:string){
  const date=new Date(value);

  return Number.isNaN(date.getTime())
    ?value
    :date.toLocaleString();
}

function formatAmount(item:TransactionHistoryItem){
  const sign=item.direction==='OUTGOING'?'-':'+';

  return `${sign}Q${item.amount.toFixed(2)}`;
}

function shortId(id:string){
  return id.length>13?`${id.slice(0,8)}…${id.slice(-4)}`:id;
}

export function TransactionHistoryPage(){
  const{customer}=useAuthStore();
  const isClient=customer?.role==='CLIENT';

  const[searchParams,setSearchParams]=useSearchParams();

  const[accounts,setAccounts]=useState<Account[]>([]);
  const[accountId,setAccountId]=
    useState(searchParams.get('accountId')??'');
  const[from,setFrom]=useState('');
  const[to,setTo]=useState('');
  const[status,setStatus]=useState<TransactionStatus|''>('');
  const[page,setPage]=useState(1);

  const[result,setResult]=useState<HistoryPage|null>(null);
  const[isLoading,setIsLoading]=useState(false);
  const[error,setError]=useState<string|null>(null);

  /*
   * El cliente elige entre sus propias cuentas. ADMIN y CASHIER
   * escriben el accountId (o llegan desde la página de cuentas).
   */
  useEffect(()=>{
    if(!isClient){
      return;
    }

    api('/api/accounts')
      .then((list:Account[])=>{
        setAccounts(list);

        if(!accountId&&list.length>0){
          setAccountId(list[0].accountId);
        }
      })
      .catch(e=>setError(e instanceof Error?e.message:String(e)));
  },[isClient]);

  const load=useCallback(async(targetPage:number)=>{
    if(!accountId){
      setResult(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try{
      const data=await fetchTransactionHistory({
        accountId,
        from,
        to,
        status,
        page:targetPage,
        size:PAGE_SIZE
      });

      setResult(data);
      setPage(targetPage);
      setSearchParams({accountId},{replace:true});
    }catch(e){
      setResult(null);
      setError(e instanceof Error?e.message:String(e));
    }finally{
      setIsLoading(false);
    }
  },[accountId,from,to,status,setSearchParams]);

  /*
   * Carga automática al elegir una cuenta del selector (CLIENT) o al
   * llegar con ?accountId= desde Cuentas. Cuando el ID se escribe a
   * mano se espera al botón Buscar para no consultar en cada tecla.
   */
  const initialAccountId=searchParams.get('accountId');

  useEffect(()=>{
    if(isClient||(accountId&&accountId===initialAccountId&&!result)){
      void load(1);
    }
  },[accountId,isClient]);

  const totalPages=result
    ?Math.max(1,Math.ceil(result.total/result.size))
    :1;

  return(
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Historial de transacciones</h1>
          <p className="muted">
            Transferencias enviadas y recibidas por cuenta.
          </p>
        </div>
      </div>

      <form
        className="card history-filters"
        onSubmit={e=>{
          e.preventDefault();
          void load(1);
        }}
      >
        <label>
          Cuenta
          {isClient?(
            <select
              value={accountId}
              onChange={e=>setAccountId(e.target.value)}
            >
              {accounts.length===0&&(
                <option value="">Sin cuentas</option>
              )}
              {accounts.map(account=>(
                <option
                  key={account.accountId}
                  value={account.accountId}
                >
                  {account.type} · {shortId(account.accountId)}
                </option>
              ))}
            </select>
          ):(
            <input
              placeholder="accountId"
              value={accountId}
              onChange={e=>setAccountId(e.target.value.trim())}
            />
          )}
        </label>

        <label>
          Desde
          <input
            type="date"
            value={from}
            max={to||undefined}
            onChange={e=>setFrom(e.target.value)}
          />
        </label>

        <label>
          Hasta
          <input
            type="date"
            value={to}
            min={from||undefined}
            onChange={e=>setTo(e.target.value)}
          />
        </label>

        <label>
          Estado
          <select
            value={status}
            onChange={e=>
              setStatus(e.target.value as TransactionStatus|'')
            }
          >
            <option value="">Todos</option>
            <option value="PENDING">Pendiente</option>
            <option value="APPROVED">Aprobada</option>
            <option value="FAILED">Fallida</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={isLoading||!accountId}
        >
          {isLoading?'Buscando...':'Buscar'}
        </button>
      </form>

      {error&&(
        <p className="error">{error}</p>
      )}

      {!accountId&&!error&&(
        <div className="card">
          Selecciona una cuenta para ver su historial.
        </div>
      )}

      {result&&result.items.length===0&&(
        <div className="card">
          No hay transacciones para los filtros seleccionados.
        </div>
      )}

      {result&&result.items.length>0&&(
        <>
          <table className="history-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Contraparte</th>
                <th>Monto</th>
                <th>Estado</th>
                <th>Transacción</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map(item=>(
                <tr key={item.transactionId}>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>
                    {item.direction==='OUTGOING'
                      ?'Enviada'
                      :'Recibida'}
                  </td>
                  <td title={
                    item.direction==='OUTGOING'
                      ?item.targetAccount
                      :item.sourceAccount
                  }>
                    {shortId(
                      item.direction==='OUTGOING'
                        ?item.targetAccount
                        :item.sourceAccount
                    )}
                  </td>
                  <td className={`amount amount-${item.direction.toLowerCase()}`}>
                    {formatAmount(item)}
                  </td>
                  <td>
                    <span
                      className={`tx-status tx-status-${item.status.toLowerCase()}`}
                      title={`Estado interno: ${item.detailedStatus}`}
                    >
                      {STATUS_LABELS[item.status]}
                    </span>
                    {item.failureReason&&(
                      <div className="muted tx-reason" title={item.failureReason}>
                        {failureReasonLabel(item.failureReason)}
                      </div>
                    )}
                  </td>
                  <td title={`correlationId: ${item.correlationId}`}>
                    <code>{shortId(item.transactionId)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pagination">
            <button
              type="button"
              disabled={isLoading||page<=1}
              onClick={()=>void load(page-1)}
            >
              Anterior
            </button>

            <span className="muted">
              Página {page} de {totalPages} · {result.total} transacciones
            </span>

            <button
              type="button"
              disabled={isLoading||page>=totalPages}
              onClick={()=>void load(page+1)}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </section>
  );
}
