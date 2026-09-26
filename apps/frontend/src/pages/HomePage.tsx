import {Link} from 'react-router-dom';
import {ArrowLeftRight,Bell,History,Landmark,ShieldCheck,Wallet} from 'lucide-react';
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
    return <Welcome/>;
  }

  return(
    <ProtectedRoute>
      <AppLayout>
        <Dashboard/>
      </AppLayout>
    </ProtectedRoute>
  );
}

const FEATURES=[
  {
    icon:Wallet,
    title:'Cuentas monetarias y de ahorro',
    text:'Abre tus cuentas y consulta saldo total y disponible en todo momento.'
  },
  {
    icon:ArrowLeftRight,
    title:'Transferencias con seguimiento',
    text:'Envía dinero entre cuentas y sigue cada paso hasta que se complete.'
  },
  {
    icon:History,
    title:'Historial por cuenta',
    text:'Filtra tus movimientos por fecha y estado: aprobados, pendientes o fallidos.'
  },
  {
    icon:ShieldCheck,
    title:'Identidad verificada',
    text:'Tu cuenta se valida (KYC) antes de mover dinero, para proteger cada operación.'
  }
];

const STEPS=[
  'Crea tu usuario con tus datos personales.',
  'Activa tu cuenta con el enlace o el botón que recibes al registrarte.',
  'Espera la verificación de tu identidad por parte del banco.',
  'Abre tus cuentas y empieza a transferir.'
];

/* Portada pública (sin sesión): bienvenida, accesos y cómo empezar. */
function Welcome(){
  return(
    <main className="landing">
      <section className="landing-hero">
        <div className="landing-brand">
          <Landmark size={28} aria-hidden="true"/>
          <span>Bank USAC</span>
        </div>

        <h1>Bienvenido a Bank USAC</h1>
        <p>
          Tu banca en línea: administra tus cuentas, transfiere dinero y revisa
          tu historial desde un solo lugar.
        </p>

        <div className="landing-actions">
          <Link to="/login" className="landing-button primary">
            Iniciar sesión
          </Link>
          <Link to="/register" className="landing-button secondary">
            Crear cuenta
          </Link>
        </div>
      </section>

      <section className="landing-features" aria-label="Qué puedes hacer">
        {FEATURES.map(({icon:Icon,title,text})=>(
          <article key={title} className="card landing-feature">
            <Icon size={24} aria-hidden="true"/>
            <strong>{title}</strong>
            <span className="muted">{text}</span>
          </article>
        ))}
      </section>

      <section className="card landing-steps">
        <h2>¿Cómo empiezo?</h2>
        <ol>
          {STEPS.map(step=>(
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="muted landing-note">
          <Bell size={16} aria-hidden="true"/>
          Recibirás notificaciones de tus transferencias y del estado de tu verificación.
        </p>
      </section>
    </main>
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
