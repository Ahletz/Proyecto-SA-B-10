import {useEffect,useState} from 'react';
import {Save,User} from 'lucide-react';
import {useAuthStore,KycStatus} from '../store/authStore';
import {api} from '../lib/api';
import {CUSTOMER_STATUS_LABELS,IDENTITY_LABELS,ROLE_LABELS,label} from '../lib/format';
import {PageHeader} from '../components/ui';

function kycLabel(status:KycStatus|undefined){
  switch(status){
    case 'VERIFIED':
      return 'Verificado';
    case 'REJECTED':
      return 'Rechazado';
    case 'PENDING':
    default:
      return 'Pendiente';
  }
}

export function ProfilePage(){
  const{customer,loadMe}=useAuthStore();

  const[email,setEmail]=useState('');
  const[fullName,setFullName]=useState('');
  const[address,setAddress]=useState('');
  const[msg,setMsg]=useState('');
  const[error,setError]=useState('');
  const[saving,setSaving]=useState(false);

  useEffect(()=>{
    if(customer){
      setEmail(customer.email);
      setFullName(customer.fullName);
      setAddress(customer.address);
    }
  },[customer]);

  return(
    <section className="page">
      <PageHeader
        icon={User}
        title="Perfil"
        description="Información personal y estado de verificación."
      />

      <div className="profile-grid">
        <div className="card form">
          <label>
            Correo electrónico
            <input
              type="email"
              value={email}
              onChange={e=>setEmail(e.target.value)}
            />
          </label>

          <label>
            Nombre completo
            <input
              value={fullName}
              onChange={e=>setFullName(e.target.value)}
            />
          </label>

          <label>
            Dirección
            <input
              value={address}
              onChange={e=>setAddress(e.target.value)}
            />
          </label>

          <button
            disabled={saving}
            onClick={async()=>{
              setSaving(true);
              setMsg('');
              setError('');

              try{
                await api('/api/customers/me',{
                  method:'PUT',
                  body:JSON.stringify({
                    email,
                    fullName,
                    address
                  })
                });

                await loadMe();
                setMsg('Perfil actualizado.');
              }catch(e){
                setError(e instanceof Error?e.message:String(e));
              }finally{
                setSaving(false);
              }
            }}
          >
            <Save size={18} aria-hidden="true"/>
            {saving?'Guardando...':'Guardar cambios'}
          </button>

          {msg&&<p className="alert alert-success">{msg}</p>}
          {error&&<p className="alert alert-error">{error}</p>}
        </div>

        <aside className="card">
          <h2>Verificación KYC</h2>

          <p className="muted">
            Solo los clientes verificados pueden transferir.
          </p>

          <div
            className={`kyc-status kyc-${(
              customer?.kycStatus??'PENDING'
            ).toLowerCase()}`}
          >
            {kycLabel(customer?.kycStatus)}
          </div>

          <dl className="profile-details">
            <div>
              <dt>Cliente</dt>
              <dd>{customer?.customerId??'-'}</dd>
            </div>

            <div>
              <dt>Usuario</dt>
              <dd>{customer?.username??'-'}</dd>
            </div>

            <div>
              <dt>Rol</dt>
              <dd>{label(ROLE_LABELS,customer?.role)}</dd>
            </div>

            <div>
              <dt>Estado de la cuenta de usuario</dt>
              <dd>{label(CUSTOMER_STATUS_LABELS,customer?.status)}</dd>
            </div>

            <div>
              <dt>Identidad</dt>
              <dd>{label(IDENTITY_LABELS,customer?.identityStatus)}</dd>
            </div>
          </dl>

          {customer?.kycStatus!=='VERIFIED'&&(
            <p className="kyc-help">
              Un administrador debe verificar tu identidad antes de
              que puedas transferir.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
