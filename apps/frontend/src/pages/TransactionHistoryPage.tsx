import {useCallback,useEffect,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {History,Inbox,Search} from 'lucide-react';
import {api} from '../lib/api';
import {formatDateTime,formatMoney} from '../lib/format';
import {
  AccountSelect,
  Badge,
  CopyId,
  CustomerSelect,
  EmptyState,
  PageHeader,
  Pagination,
  TableWrap,
  useClientCustomers
} from '../components/ui';
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

const STATUS_TONES:Record<TransactionStatus,'warning'|'success'|'danger'>={
  PENDING:'warning',
  APPROVED:'success',
  FAILED:'danger'
};

function formatAmount(item:TransactionHistoryItem){
  const sign=item.direction==='OUTGOING'?'-':'+';

  return `${sign}${formatMoney(item.amount)}`;
}

export function TransactionHistoryPage(){
  const{customer}=useAuthStore();
  const isClient=customer?.role==='CLIENT';

  const[searchParams,setSearchParams]=useSearchParams();

  const[accounts,setAccounts]=useState<Account[]>([]);
  const[accountId,setAccountId]=
    useState(searchParams.get('accountId')??'');
  // ADMIN y CASHIER eligen primero el cliente y luego una de sus cuentas.
  const[customerId,setCustomerId]=
    useState(searchParams.get('customerId')??'');
  const{customers}=useClientCustomers(!isClient);
  const[from,setFrom]=useState('');
  const[to,setTo]=useState('');
  const[status,setStatus]=useState<TransactionStatus|''>('');
  const[page,setPage]=useState(1);

  const[result,setResult]=useState<HistoryPage|null>(null);
  const[isLoading,setIsLoading]=useState(false);
  const[error,setError]=useState<string|null>(null);

  /*
   * El cliente elige entre sus propias cuentas; ADMIN y CASHIER entre las
   * del cliente seleccionado (o llegan desde Cuentas con ?accountId=&customerId=).
   */
  useEffect(()=>{
    if(!isClient&&!customerId){
      setAccounts([]);
      return;
    }

    const query=isClient?'':`?customerId=${encodeURIComponent(customerId)}`;

    api(`/api/accounts${query}`)
      .then((list:Account[])=>{
        setAccounts(list);
        setAccountId(current=>
          list.some(a=>a.accountId===current)?current:list[0]?.accountId??''
        );
      })
      .catch(e=>setError(e instanceof Error?e.message:String(e)));
  },[isClient,customerId]);

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
      setSearchParams(isClient?{accountId}:{accountId,customerId},{replace:true});
    }catch(e){
      setResult(null);
      setError(e instanceof Error?e.message:String(e));
    }finally{
      setIsLoading(false);
    }
  },[accountId,customerId,isClient,from,to,status,setSearchParams]);

  // Carga al elegir una cuenta; los filtros de fecha y estado se aplican con Buscar.
  useEffect(()=>{
    void load(1);
  // A propósito sin load: los filtros se aplican con Buscar, no en cada cambio.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[accountId]);

  const totalPages=result
    ?Math.max(1,Math.ceil(result.total/result.size))
    :1;

  return(
    <section className="page">
      <PageHeader
        icon={History}
        title="Historial de transacciones"
        description="Transferencias enviadas y recibidas por cuenta."
      />

      <form
        className="card history-filters"
        onSubmit={e=>{
          e.preventDefault();
          void load(1);
        }}
      >
        {!isClient&&(
          <label>
            Cliente
            <CustomerSelect
              customers={customers}
              value={customerId}
              onChange={setCustomerId}
            />
          </label>
        )}

        <label>
          Cuenta
          <AccountSelect
            accounts={accounts}
            value={accountId}
            onChange={setAccountId}
            emptyLabel={isClient||customerId?'Sin cuentas':'Elige un cliente primero'}
          />
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
          <Search size={16} aria-hidden="true"/>
          {isLoading?'Buscando...':'Buscar'}
        </button>
      </form>

      {error&&(
        <p className="alert alert-error">{error}</p>
      )}

      {!accountId&&!error&&(
        <EmptyState icon={History}>
          {isClient?'Todavía no tienes cuentas.':'Elige un cliente y una de sus cuentas para ver su historial.'}
        </EmptyState>
      )}

      {result&&result.items.length===0&&(
        <EmptyState icon={Inbox}>
          No hay transacciones para los filtros seleccionados.
        </EmptyState>
      )}

      {result&&result.items.length>0&&(
        <>
          <TableWrap>
          <table className="history-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Contraparte</th>
                <th className="num">Monto</th>
                <th>Estado</th>
                <th>Transacción</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map(item=>(
                <tr key={item.transactionId}>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td>
                    {item.direction==='OUTGOING'
                      ?'Enviada'
                      :'Recibida'}
                  </td>
                  <td>
                    <CopyId value={
                      item.direction==='OUTGOING'
                        ?item.targetAccount
                        :item.sourceAccount
                    }/>
                  </td>
                  <td className={`num amount amount-${item.direction.toLowerCase()}`}>
                    {formatAmount(item)}
                  </td>
                  <td>
                    <span title={`Estado interno: ${item.detailedStatus}`}>
                      <Badge tone={STATUS_TONES[item.status]}>
                        {STATUS_LABELS[item.status]}
                      </Badge>
                    </span>
                    {item.failureReason&&(
                      <div className="muted tx-reason" title={item.failureReason}>
                        {failureReasonLabel(item.failureReason)}
                      </div>
                    )}
                  </td>
                  <td>
                    <CopyId value={item.transactionId}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableWrap>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={result.total}
            noun="transacciones"
            disabled={isLoading}
            onChange={p=>void load(p)}
          />
        </>
      )}
    </section>
  );
}
