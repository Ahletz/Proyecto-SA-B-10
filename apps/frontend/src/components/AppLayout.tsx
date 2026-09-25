import {NavLink,Outlet,useNavigate} from 'react-router-dom';
import {Role,useAuthStore} from '../store/authStore';

interface NavItem{
  to:string;
  label:string;
  roles?:Role[];
}

/*
 * Menú del shell. Los roles deben coincidir con los de App.tsx
 * (ProtectedRoute) y con los @Roles del API Gateway.
 */
export const NAV_ITEMS:NavItem[]=[
  {to:'/',label:'Inicio'},
  {to:'/profile',label:'Perfil'},
  {to:'/accounts',label:'Cuentas'},
  {to:'/transfer',label:'Transferir',roles:['CLIENT']},
  {to:'/transactions',label:'Historial'},
  {to:'/payments',label:'Pagos',roles:['ADMIN','CASHIER']},
  {to:'/notifications',label:'Notificaciones',roles:['ADMIN']},
  {to:'/audit',label:'Auditoría',roles:['ADMIN']}
];

const ROLE_LABELS:Record<Role,string>={
  ADMIN:'Administrador',
  CASHIER:'Cajero',
  CLIENT:'Cliente'
};

export function navItemsFor(role:Role){
  return NAV_ITEMS.filter(item=>!item.roles||item.roles.includes(role));
}

export function AppLayout({children}:{children?:React.ReactNode}){
  const{customer,logout}=useAuthStore();
  const navigate=useNavigate();

  if(!customer){
    return null;
  }

  return(
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <NavLink to="/" className="brand">Bank USAC</NavLink>

          <nav className="app-nav" aria-label="Principal">
            {navItemsFor(customer.role).map(item=>(
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to==='/'}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="app-user">
            <span>
              {customer.fullName||customer.username}
              <small className="muted"> · {ROLE_LABELS[customer.role]}</small>
            </span>
            <button
              type="button"
              className="secondary"
              onClick={()=>{
                logout();
                navigate('/login');
              }}
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main>
        {children??<Outlet/>}
      </main>
    </div>
  );
}
