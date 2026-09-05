import {Navigate} from 'react-router-dom';import {useAuthStore,Role} from '../store/authStore';
export function ProtectedRoute({children,roles}:{children:React.ReactNode;roles?:Role[]}){const {token,customer}=useAuthStore();if(!token)return <Navigate to="/login" replace/>;if(roles&&customer&&!roles.includes(customer.role))return <Navigate to="/" replace/>;return <>{children}</>;}
