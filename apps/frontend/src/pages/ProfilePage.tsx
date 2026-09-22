import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuthStore,KycStatus} from '../store/authStore';
import {api} from '../lib/api';

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

  useEffect(()=>{
    if(customer){
      setEmail(customer.email);
      setFullName(customer.fullName);
      setAddress(customer.address);
    }
  },[customer]);

  return(
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Perfil</h1>
          <p className="muted">
            Información personal y estado de verificación.
          </p>
        </div>

        <Link to="/">Volver</Link>
      </div>

      <div className="profile-grid">
        <div className="card form">
          <label>
            Email
            <input
              value={email}
              onChange={e=>setEmail(e.target.value)}
            />
          </label>

          <label>
            Nombre
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
            onClick={async()=>{
              await api('/api/customers/me',{
                method:'PUT',
                body:JSON.stringify({
                  email,
                  fullName,
                  address
                })
              });

              await loadMe();
              setMsg('Perfil actualizado');
            }}
          >
            Guardar
          </button>

          {msg&&<p className="notice">{msg}</p>}
        </div>

        <aside className="card">
          <h2>Verificación KYC</h2>

          <p className="muted">
            Estado de validación de identidad del cliente.
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
              <dt>Estado de cuenta</dt>
              <dd>{customer?.status??'-'}</dd>
            </div>

            <div>
              <dt>Identidad</dt>
              <dd>{customer?.identityStatus??'-'}</dd>
            </div>
          </dl>

          {customer?.kycStatus!=='VERIFIED'&&(
            <p className="kyc-help">
              Las transacciones requieren que el estado
              KYC sea VERIFIED.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
