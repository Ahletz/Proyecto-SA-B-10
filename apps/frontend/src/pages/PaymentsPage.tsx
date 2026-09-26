import {useCallback,useEffect,useMemo,useState} from 'react';
import {CreditCard,Inbox,RefreshCw} from 'lucide-react';
import {api} from '../lib/api';
import {formatDateTime,formatMoney} from '../lib/format';
import {
  Badge,
  CopyId,
  EmptyState,
  PageHeader,
  Pagination,
  TableWrap,
  paginate
} from '../components/ui';

const PAGE_SIZE=20;

const REASON_LABELS:Record<string,string>={
  INVALID_AMOUNT:'Monto inválido',
  PAYMENT_LIMIT_EXCEEDED:'Excede el límite permitido',
  EXTERNAL_FAILURE:'Fallo del procesador externo',
  TIMEOUT:'Tiempo de espera agotado'
};

interface Payment{
  paymentId:string;
  transactionId:string;
  amount:number|string;
  status:'APPROVED'|'REJECTED';
  reason?:string|null;
  createdAt?:string|null;
}

type StatusFilter='ALL'|Payment['status'];

export function PaymentsPage(){
  const[payments,setPayments]=useState<Payment[]>([]);
  const[filter,setFilter]=useState<StatusFilter>('ALL');
  const[page,setPage]=useState(1);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);
    setError('');

    try{
      setPayments(await api('/api/payments'));
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
    }finally{
      setLoading(false);
    }
  },[]);

  useEffect(()=>{
    void load();
  },[load]);

  const filtered=useMemo(()=>
    filter==='ALL'?payments:payments.filter(p=>p.status===filter)
  ,[payments,filter]);

  const approved=payments.filter(p=>p.status==='APPROVED').length;
  const current=paginate(filtered,page,PAGE_SIZE);

  return(
    <section className="page">
      <PageHeader
        icon={CreditCard}
        title="Pagos procesados"
        description="Resultado del procesador de pagos para cada transferencia."
        actions={(
          <button type="button" className="secondary" onClick={()=>void load()} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true"/>
            {loading?'Actualizando...':'Actualizar'}
          </button>
        )}
      />

      <div className="stat-grid">
        <div className="stat-card">
          <span className="muted">Pagos</span>
          <strong>{payments.length}</strong>
        </div>
        <div className="stat-card">
          <span className="muted">Aprobados</span>
          <strong className="text-success">{approved}</strong>
        </div>
        <div className="stat-card">
          <span className="muted">Rechazados</span>
          <strong className="text-danger">{payments.length-approved}</strong>
        </div>
      </div>

      <div className="card filter-bar">
        <label>
          Estado
          <select
            value={filter}
            onChange={e=>{
              setFilter(e.target.value as StatusFilter);
              setPage(1);
            }}
          >
            <option value="ALL">Todos</option>
            <option value="APPROVED">Aprobados</option>
            <option value="REJECTED">Rechazados</option>
          </select>
        </label>
      </div>

      {error&&<p className="alert alert-error">{error}</p>}

      {!loading&&filtered.length===0&&!error&&(
        <EmptyState icon={Inbox}>No hay pagos para el filtro seleccionado.</EmptyState>
      )}

      {filtered.length>0&&(
        <>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Pago</th>
                  <th>Transacción</th>
                  <th className="num">Monto</th>
                  <th>Estado</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {current.items.map(p=>(
                  <tr key={p.paymentId}>
                    <td>{formatDateTime(p.createdAt)}</td>
                    <td><CopyId value={p.paymentId}/></td>
                    <td><CopyId value={p.transactionId}/></td>
                    <td className="num strong">{formatMoney(p.amount)}</td>
                    <td>
                      <Badge tone={p.status==='APPROVED'?'success':'danger'}>
                        {p.status==='APPROVED'?'Aprobado':'Rechazado'}
                      </Badge>
                    </td>
                    <td>{p.reason?(REASON_LABELS[p.reason]??p.reason):'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>

          <Pagination
            page={current.page}
            totalPages={current.totalPages}
            total={filtered.length}
            noun="pagos"
            onChange={setPage}
          />
        </>
      )}
    </section>
  );
}
