import {Link} from 'react-router-dom';
import {AppLayout,navItemsFor} from '../components/AppLayout';
import {ProtectedRoute} from '../components/ProtectedRoute';
import {useAuthStore} from '../store/authStore';

const DESCRIPTIONS:Record<string,string>={
  '/profile':'Datos personales y estado de verificación KYC.',
  '/accounts':'Cuentas monetarias y de ahorro, saldos y reservas.',
  '/transfer':'Envía dinero y sigue el estado de la transferencia.',
  '/transactions':'Transferencias enviadas y recibidas por cuenta.',
  '/payments':'Pagos procesados y su resultado.',
  '/notifications':'Notificaciones clasificadas por severidad.',
  '/audit':'Registro de auditoría de los eventos del sistema.'
};

export function HomePage(){
  const{token}=useAuthStore();

  if(!token){
    return(
      <main className="center">
        <div className="card">
          <h1>Bank USAC</h1>
          <p>Arquitectura de microservicios asíncrona.</p>
          <Link to="/login">Login</Link> · <Link to="/register">Registro</Link>
        </div>
      </main>
    );
  }

  return(
    <ProtectedRoute>
      <AppLayout>
        <Dashboard/>
      </AppLayout>
    </ProtectedRoute>
  );
}

function Dashboard(){
  const{customer}=useAuthStore();

  if(!customer){
    return null;
  }

  const shortcuts=navItemsFor(customer.role).filter(item=>item.to!=='/');

  return(
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Hola, {customer.fullName||customer.username}</h1>
          <p className="muted">
            {customer.role==='CLIENT'&&'Consulta tus cuentas, transfiere y revisa tu historial.'}
            {customer.role==='CASHIER'&&'Consulta cuentas de clientes y los pagos procesados.'}
            {customer.role==='ADMIN'&&'Supervisa clientes, pagos, notificaciones y auditoría.'}
          </p>
        </div>
      </div>

      {customer.role==='CLIENT'&&customer.kycStatus!=='VERIFIED'&&(
        <p className="kyc-help">
          Tu identidad todavía no está verificada (KYC {customer.kycStatus}).
          Las transferencias serán rechazadas hasta que un administrador
          la verifique. Revisa el estado en <Link to="/profile">Perfil</Link>.
        </p>
      )}

      <div className="shortcut-grid">
        {shortcuts.map(item=>(
          <Link key={item.to} to={item.to} className="card shortcut">
            <strong>{item.label}</strong>
            <span className="muted">{DESCRIPTIONS[item.to]}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
