import React from 'react';
import { useAuthStore } from '../store/authStore';
import { ShieldAlert } from 'lucide-react';

interface ProtectedRouteProps { children: React.ReactNode; }

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const token = useAuthStore((state) => state.token);
  const customer = useAuthStore((state) => state.customer);
  if (!token || !customer) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4"><div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg ring-1 ring-slate-200"><ShieldAlert className="mx-auto mb-4 text-amber-500" size={48}/><h1 className="text-2xl font-bold text-slate-900">Acceso Denegado</h1><p className="mt-2 text-slate-600">Por favor inicia sesión primero.</p></div></div>;
  }
  return <>{children}</>;
};
