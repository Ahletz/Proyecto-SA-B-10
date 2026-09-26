import {FormEvent,useCallback,useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeftRight,History,Plus,Wallet} from 'lucide-react';
import {api} from '../lib/api';
import {
  ACCOUNT_STATUS_LABELS,
  ACCOUNT_TYPE_LABELS,
  formatMoney,
  label
} from '../lib/format';
import {
  Badge,
  CopyId,
  CustomerSelect,
  EmptyState,
  PageHeader,
  TableWrap,
  useClientCustomers
} from '../components/ui';
import {useAuthStore} from '../store/authStore';

interface Account{
  accountId:string;
  type:string;
  balance:number|string;
  reservedBalance:number|string;
  availableBalance:number|string;
  minBalance:number|string;
  feeAmount:number|string|null;
  status:string;
}

export function AccountsPage(){
  const{customer}=useAuthStore();
  const isClient=customer?.role==='CLIENT';
  const{customers,error:customersError}=useClientCustomers(!isClient);

  // ADMIN y CASHIER eligen el cliente; CLIENT siempre ve las suyas.
  const[customerId,setCustomerId]=useState('');
  const[accounts,setAccounts]=useState<Account[]>([]);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState('');

  const[type,setType]=useState('MONETARY');
  const[initial,setInitial]=useState('1000');
  const[minBalance,setMinBalance]=useState('');
  const[feeAmount,setFeeAmount]=useState('');
  const[creating,setCreating]=useState(false);
  const[message,setMessage]=useState('');

  const canQuery=isClient||Boolean(customerId);

  const load=useCallback(async()=>{
    if(!canQuery){
      setAccounts([]);
      return;
    }

    setLoading(true);
    setError('');

    try{
      const query=isClient?'':`?customerId=${encodeURIComponent(customerId)}`;
      setAccounts(await api(`/api/accounts${query}`));
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
    }finally{
      setLoading(false);
    }
  },[canQuery,isClient,customerId]);

  useEffect(()=>{
    if(customer){
      void load();
    }
  },[customer,load]);

  async function create(e:FormEvent){
    e.preventDefault();
    setCreating(true);
    setMessage('');
    setError('');

    try{
      const body:Record<string,unknown>={
        type,
        initialBalance:Number(initial||0),
        customerId:isClient?undefined:customerId
      };

      if(minBalance!==''){
        body.minBalance=Number(minBalance);
      }

      if(feeAmount!==''){
        body.feeAmount=Number(feeAmount);
      }

      await api('/api/accounts',{method:'POST',body:JSON.stringify(body)});
      setMinBalance('');
      setFeeAmount('');
      setMessage(`Cuenta ${label(ACCOUNT_TYPE_LABELS,type).toLowerCase()} creada.`);
      await load();
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
    }finally{
      setCreating(false);
    }
  }

  const active=accounts.filter(a=>a.status==='ACTIVE');
  const totalBalance=accounts.reduce((sum,a)=>sum+Number(a.balance),0);
  const totalAvailable=active.reduce((sum,a)=>sum+Number(a.availableBalance),0);

  return(
    <section className="page">
      <PageHeader
        icon={Wallet}
        title="Cuentas"
        description={isClient
          ?'Tus cuentas monetarias y de ahorro, con su saldo disponible.'
          :'Consulta y abre cuentas de un cliente.'}
      />

      {!isClient&&(
        <div className="card filter-bar">
          <label>
            Cliente
            <CustomerSelect
              customers={customers}
              value={customerId}
              onChange={setCustomerId}
            />
          </label>
          {customersError&&<p className="alert alert-error">{customersError}</p>}
        </div>
      )}

      {canQuery&&(
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <span className="muted">Saldo total</span>
              <strong>{formatMoney(totalBalance)}</strong>
            </div>
            <div className="stat-card">
              <span className="muted">Disponible</span>
              <strong>{formatMoney(totalAvailable)}</strong>
            </div>
            <div className="stat-card">
              <span className="muted">Cuentas activas</span>
              <strong>{active.length} de {accounts.length}</strong>
            </div>
          </div>

          <form className="card new-account" onSubmit={create}>
            <h2>Abrir una cuenta nueva</h2>
            <div className="new-account-fields">
              <label>
                Tipo de cuenta
                <select value={type} onChange={e=>setType(e.target.value)}>
                  <option value="MONETARY">Monetaria (corriente)</option>
                  <option value="SAVINGS">Ahorro</option>
                </select>
              </label>
              <label>
                Saldo inicial (Q)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={initial}
                  onChange={e=>setInitial(e.target.value)}
                  required
                />
              </label>
              <label>
                Saldo mínimo (Q)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minBalance}
                  onChange={e=>setMinBalance(e.target.value)}
                  placeholder={type==='SAVINGS'?'50 por defecto':'0 por defecto'}
                />
              </label>
              <label>
                Comisión por transferencia (Q)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={feeAmount}
                  onChange={e=>setFeeAmount(e.target.value)}
                  placeholder="Opcional"
                />
              </label>
              <button disabled={creating}>
                <Plus size={18} aria-hidden="true"/>
                {creating?'Creando...':'Crear cuenta'}
              </button>
            </div>
            {message&&<p className="alert alert-success">{message}</p>}
          </form>
        </>
      )}

      {error&&<p className="alert alert-error">{error}</p>}

      {!canQuery&&(
        <EmptyState icon={Wallet}>Selecciona un cliente para ver sus cuentas.</EmptyState>
      )}

      {canQuery&&!loading&&accounts.length===0&&!error&&(
        <EmptyState icon={Wallet}>
          {isClient?'Todavía no tienes cuentas. Abre la primera con el formulario de arriba.':'Este cliente todavía no tiene cuentas.'}
        </EmptyState>
      )}

      {accounts.length>0&&(
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Tipo</th>
                <th className="num">Saldo</th>
                <th className="num">Reservado</th>
                <th className="num">Disponible</th>
                <th className="num">Saldo mínimo</th>
                <th className="num">Comisión</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(a=>(
                <tr key={a.accountId}>
                  <td><CopyId value={a.accountId}/></td>
                  <td>{label(ACCOUNT_TYPE_LABELS,a.type)}</td>
                  <td className="num">{formatMoney(a.balance)}</td>
                  <td className="num">{formatMoney(a.reservedBalance)}</td>
                  <td className="num strong">{formatMoney(a.availableBalance)}</td>
                  <td className="num">{formatMoney(a.minBalance)}</td>
                  <td className="num">{a.feeAmount!=null?formatMoney(a.feeAmount):'—'}</td>
                  <td>
                    <Badge tone={a.status==='ACTIVE'?'success':'neutral'}>
                      {label(ACCOUNT_STATUS_LABELS,a.status)}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link className="btn small secondary" to={`/transactions?accountId=${a.accountId}${isClient?'':`&customerId=${customerId}`}`}>
                        <History size={15} aria-hidden="true"/> Historial
                      </Link>
                      {isClient&&a.status==='ACTIVE'&&(
                        <Link className="btn small secondary" to={`/transfer?source=${a.accountId}`}>
                          <ArrowLeftRight size={15} aria-hidden="true"/> Transferir
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </section>
  );
}
