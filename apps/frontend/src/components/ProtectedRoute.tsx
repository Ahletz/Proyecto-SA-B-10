import {useEffect} from 'react';
import {Navigate} from 'react-router-dom';
import {useAuthStore,Role} from '../store/authStore';

export function ProtectedRoute({
  children,
  roles
}:{
  children:React.ReactNode;
  roles?:Role[];
}){
  const{
    token,
    customer,
    loading,
    loadMe
  }=useAuthStore();

  useEffect(()=>{
    if(token&&!customer&&!loading){
      void loadMe();
    }
  },[token,customer,loading,loadMe]);

  if(!token){
    return <Navigate to="/login" replace/>;
  }

  if(loading||!customer){
    return(
      <main className="center">
        <div className="card">
          Cargando sesión...
        </div>
      </main>
    );
  }

  if(
    roles
    &&!roles.includes(customer.role)
  ){
    return <Navigate to="/" replace/>;
  }

  return <>{children}</>;
}
