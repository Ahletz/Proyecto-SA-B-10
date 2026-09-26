import {useCallback,useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../lib/api';

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

  return(
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Clientes · KYC</h1>
          <p className="muted">
            Solo los clientes con KYC verificado pueden transferir.
          </p>
        </div>

        <div className="toolbar">
          <button
            type="button"
            onClick={()=>void load()}
            disabled={isLoading}
          >
            {isLoading?'Actualizando...':'Actualizar'}
          </button>

          <Link to="/">Volver</Link>
        </div>
      </div>

      <div className="toolbar">
        <label>
          Estado KYC{' '}
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
        <p className="error">{error}</p>
      )}

      {!isLoading&&customers.length===0&&(
        <div className="card">
          No hay clientes para el filtro seleccionado.
        </div>
      )}

      {customers.length>0&&(
        <table className="history-table customer-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Nombre</th>
              <th>Documento</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>KYC</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {customers.map(customer=>(
              <tr key={customer.customerId}>
                <td>
                  {customer.customerId}
                  <br/>
                  <small className="muted">{customer.username}</small>
                </td>
                <td>
                  {customer.fullName}
                  <br/>
                  <small className="muted">{customer.email}</small>
                </td>
                <td>{customer.documentNumber}</td>
                <td>{customer.role}</td>
                <td>{customer.status}</td>
                <td>
                  <span className={`kyc-status kyc-${customer.kycStatus.toLowerCase()}`}>
                    {KYC_LABELS[customer.kycStatus]}
                  </span>
                </td>
                <td>
                  <div className="toolbar">
                    <button
                      type="button"
                      disabled={updating===customer.customerId||customer.kycStatus==='VERIFIED'}
                      onClick={()=>void changeKyc(customer.customerId,'VERIFIED')}
                    >
                      Verificar
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={updating===customer.customerId||customer.kycStatus==='REJECTED'}
                      onClick={()=>void changeKyc(customer.customerId,'REJECTED')}
                    >
                      Rechazar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
