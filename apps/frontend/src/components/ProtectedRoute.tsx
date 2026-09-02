import React from 'react';
import { useAuthStore } from '../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const token = useAuthStore((state) => state.token);
  const customer = useAuthStore((state) => state.customer);

  if (!token || !customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Acceso Denegado</h1>
          <p className="text-slate-600">Por favor inicia sesión primero</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
