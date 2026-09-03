import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { CheckCircle, AlertCircle, Loader, ShieldCheck } from 'lucide-react';

export const ActivationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Activando tu cuenta...');
  const { activate } = useAuthStore();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) { setStatus('error'); setMessage('Token de activación no encontrado'); return; }
    const performActivation = async () => {
      try { await activate(token); setStatus('success'); setMessage('¡Tu cuenta ha sido activada exitosamente!'); setTimeout(() => navigate('/login'), 2000); }
      catch (err) { setStatus('error'); setMessage(err instanceof Error ? err.message : 'Error al activar cuenta'); }
    };
    performActivation();
  }, [searchParams, activate, navigate]);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center">
        <section className="w-full rounded-2xl bg-white p-8 text-center shadow-xl ring-1 ring-slate-200">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-950 text-cyan-300"><ShieldCheck size={28} /></div>
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Banco USAC</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Activación de cuenta</h1>
          <div className="mt-8">
            {status === 'loading' && <><Loader className="mx-auto mb-4 animate-spin text-blue-700" size={48} /><p className="text-slate-600">{message}</p></>}
            {status === 'success' && <><CheckCircle className="mx-auto mb-4 text-emerald-500" size={48} /><p className="font-semibold text-slate-800">{message}</p><p className="mt-2 text-sm text-slate-500">Redirigiendo a inicio de sesión...</p></>}
            {status === 'error' && <><AlertCircle className="mx-auto mb-4 text-red-500" size={48} /><p className="font-semibold text-red-700">{message}</p><button onClick={() => navigate('/login')} className="mt-6 rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800">Ir al Login</button></>}
          </div>
        </section>
      </div>
    </main>
  );
};
