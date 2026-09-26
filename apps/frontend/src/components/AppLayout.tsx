import {useEffect,useState} from 'react';
import {NavLink,Outlet,useLocation,useNavigate} from 'react-router-dom';
import {
  ArrowLeftRight,
  Bell,
  CreditCard,
  History,
  Home,
  Landmark,
  LogOut,
  LucideIcon,
  Menu,
  ScrollText,
  User,
  UserCheck,
  Wallet,
  X
} from 'lucide-react';
import {Role,useAuthStore} from '../store/authStore';
import {ROLE_LABELS} from '../lib/format';

interface NavItem{
  to:string;
  label:string;
  icon:LucideIcon;
  roles?:Role[];
}

/*
 * Menú del shell. Los roles deben coincidir con los de App.tsx
 * (ProtectedRoute) y con los @Roles del API Gateway.
 */
export const NAV_ITEMS:NavItem[]=[
  {to:'/',label:'Inicio',icon:Home},
  {to:'/profile',label:'Perfil',icon:User},
  {to:'/accounts',label:'Cuentas',icon:Wallet},
  {to:'/transfer',label:'Transferir',icon:ArrowLeftRight,roles:['CLIENT']},
  {to:'/transactions',label:'Historial',icon:History},
  {to:'/payments',label:'Pagos',icon:CreditCard,roles:['ADMIN','CASHIER']},
  {to:'/customers',label:'Clientes',icon:UserCheck,roles:['ADMIN']},
  {to:'/notifications',label:'Notificaciones',icon:Bell,roles:['ADMIN']},
  {to:'/audit',label:'Auditoría',icon:ScrollText,roles:['ADMIN']}
];

export function navItemsFor(role:Role){
  return NAV_ITEMS.filter(item=>!item.roles||item.roles.includes(role));
}

export function AppLayout({children}:{children?:React.ReactNode}){
  const{customer,logout}=useAuthStore();
  const navigate=useNavigate();
  const location=useLocation();
  const[menuOpen,setMenuOpen]=useState(false);

  // En celular el menú se cierra al navegar.
  useEffect(()=>setMenuOpen(false),[location.pathname]);

  if(!customer){
    return null;
  }

  return(
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <NavLink to="/" className="brand">
            <Landmark size={22} aria-hidden="true"/>
            Bank USAC
          </NavLink>

          <button
            type="button"
            className="icon-button menu-toggle"
            aria-label={menuOpen?'Cerrar menú':'Abrir menú'}
            aria-expanded={menuOpen}
            onClick={()=>setMenuOpen(open=>!open)}
          >
            {menuOpen?<X size={22}/>:<Menu size={22}/>}
          </button>

          <nav className={`app-nav${menuOpen?' open':''}`} aria-label="Principal">
            {navItemsFor(customer.role).map(({to,label,icon:Icon})=>(
              <NavLink
                key={to}
                to={to}
                end={to==='/'}
              >
                <Icon size={17} aria-hidden="true"/>
                {label}
              </NavLink>
            ))}
          </nav>

          <div className={`app-user${menuOpen?' open':''}`}>
            <span className="app-user-name">
              {customer.fullName||customer.username}
              <small>{ROLE_LABELS[customer.role]}</small>
            </span>
            <button
              type="button"
              className="secondary on-dark"
              onClick={()=>{
                logout();
                navigate('/login');
              }}
            >
              <LogOut size={16} aria-hidden="true"/>
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
