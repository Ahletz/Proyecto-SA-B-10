import {useCallback,useEffect,useState} from 'react';
import {CheckCircle2,RefreshCw,UserCheck,Users,XCircle} from 'lucide-react';
import {api} from '../lib/api';
import {CUSTOMER_STATUS_LABELS,label} from '../lib/format';
import {EmptyState,PageHeader,TableWrap} from '../components/ui';

type KycStatus='PENDING'|'VERIFIED'|'REJECTED';
type KycFilter=''|KycStatus;

interface CustomerRow{
  customerId:string;
  username:string;
  fullName:string;
  email:string;
  documentNumber:string;
  role:string;
  status:string;
  kycStatus:KycStatus;
}

const KYC_LABELS:Record<KycStatus,string>={
  PENDING:'Pendiente',
  VERIFIED:'Verificado',
  REJECTED:'Rechazado'
};

/*
 * Revisión KYC para ADMIN: lista clientes (GET /api/customers) y cambia su
 * estado (PATCH /api/customers/:id/kyc). Customer publica
 * customer.kyc.status.changed y Transaction actualiza su proyección.
 */
export function CustomersPage(){
  const[filter,setFilter]=useState<KycFilter>('PENDING');
  const[customers,setCustomers]=useState<CustomerRow[]>([]);
  const[isLoading,setIsLoading]=useState(false);
  const[updating,setUpdating]=useState<string|null>(null);
  const[error,setError]=useState('');

  const load=useCallback(async()=>{
    setIsLoading(true);
    setError('');

    try{
      const query=filter?`?kycStatus=${filter}`:'';
      setCustomers(await api(`/api/customers${query}`));
    }catch(e){
      setError(e instanceof Error?e.message:'No se pudo cargar la lista de clientes');
    }finally{
      setIsLoading(false);
    }
  },[filter]);

  useEffect(()=>{
    void load();
  },[load]);

  async function changeKyc(customerId:string,status:KycStatus){
    setUpdating(customerId);
    setError('');

    try{
      await api(`/api/customers/${encodeURIComponent(customerId)}/kyc`,{
        method:'PATCH',
        body:JSON.stringify({status})
      });
      await load();
    }catch(e){
      setError(e instanceof Error?e.message:'No se pudo actualizar el KYC');
    }finally{
      setUpdating(null);
    }
  }

  // El KYC solo aplica a clientes; ADMIN y CASHIER no se listan aquí.
  const clients=customers.filter(c=>c.role==='CLIENT');

  return(
    <section className="page">
      <PageHeader
        icon={UserCheck}
        title="Clientes · KYC"
        description="Verifica la identidad de los clientes. Solo los verificados pueden transferir."
        actions={(
          <button
            type="button"
            className="secondary"
            onClick={()=>void load()}
            disabled={isLoading}
          >
            <RefreshCw size={16} aria-hidden="true"/>
            {isLoading?'Actualizando...':'Actualizar'}
          </button>
        )}
      />

      <div className="card filter-bar">
        <label>
          Estado KYC
          <select
            value={filter}
            onChange={e=>setFilter(e.target.value as KycFilter)}
          >
            <option value="">Todos</option>
            <option value="PENDING">Pendiente</option>
            <option value="VERIFIED">Verificado</option>
            <option value="REJECTED">Rechazado</option>
          </select>
        </label>
      </div>

      {error&&(
        <p className="alert alert-error">{error}</p>
      )}

      {!isLoading&&clients.length===0&&(
        <EmptyState icon={Users}>
          No hay clientes para el filtro seleccionado.
        </EmptyState>
      )}

      {clients.length>0&&(
        <TableWrap>
          <table className="customer-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Nombre</th>
                <th>Documento</th>
                <th>Cuenta de usuario</th>
                <th>KYC</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {clients.map(customer=>(
                <tr key={customer.customerId}>
                  <td>
                    <strong>{customer.customerId}</strong>
                    <br/>
                    <small className="muted">{customer.username}</small>
                  </td>
                  <td>
                    {customer.fullName}
                    <br/>
                    <small className="muted">{customer.email}</small>
                  </td>
                  <td>{customer.documentNumber}</td>
                  <td>{label(CUSTOMER_STATUS_LABELS,customer.status)}</td>
                  <td>
                    <span className={`kyc-status kyc-${customer.kycStatus.toLowerCase()}`}>
                      {KYC_LABELS[customer.kycStatus]}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="small"
                        disabled={updating===customer.customerId||customer.kycStatus==='VERIFIED'}
                        onClick={()=>void changeKyc(customer.customerId,'VERIFIED')}
                      >
                        <CheckCircle2 size={15} aria-hidden="true"/>
                        Verificar
                      </button>
                      <button
                        type="button"
                        className="small danger-outline"
                        disabled={updating===customer.customerId||customer.kycStatus==='REJECTED'}
                        onClick={()=>void changeKyc(customer.customerId,'REJECTED')}
                      >
                        <XCircle size={15} aria-hidden="true"/>
                        Rechazar
                      </button>
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
