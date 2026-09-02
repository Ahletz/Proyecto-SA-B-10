import React, { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { useAuditStore } from '../store/auditStore';
import { Eye, LogOut, Loader, AlertCircle, User, ShieldCheck } from 'lucide-react';

export const AuditPage: React.FC = () => {
  const { customer, logout } = useAuthStore();
  const { events, isLoading, error, fetchEvents } = useAuditStore();
  const navigate = useNavigate();

  useEffect(() => { if (customer) fetchEvents(); }, [customer, fetchEvents]);
  if (!customer) return <div className="flex min-h-screen items-center justify-center bg-slate-100"><div className="text-center"><h1 className="text-2xl font-bold text-slate-900">Acceso Denegado</h1><p className="mt-2 text-slate-600">Por favor inicia sesión primero.</p></div></div>;
  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl bg-blue-950 p-6 text-white shadow-lg sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="mb-2 text-sm font-semibold uppercase tracking-widest text-cyan-300">Banco USAC</p><h1 className="text-3xl font-bold">Auditoría de Eventos</h1><p className="mt-2 text-blue-100">Historial de eventos procesados en tu cuenta.</p></div>
            <div className="flex flex-col gap-2 sm:flex-row"><button onClick={() => navigate('/profile')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 font-semibold text-blue-950 hover:bg-blue-50"><User size={18}/> Mi Perfil</button><button onClick={handleLogout} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white hover:bg-red-700"><LogOut size={18}/> Cerrar Sesión</button></div>
          </div>
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-200 sm:p-8">
          {error && <div className="mb-6 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700"><AlertCircle className="mt-0.5 shrink-0" size={20}/><div><p className="font-semibold">Error al cargar auditoría</p><p className="text-sm">{error}</p></div></div>}
          {isLoading && <div className="flex items-center justify-center py-16"><Loader className="mr-3 animate-spin text-blue-700" size={30}/><p className="text-slate-600">Cargando eventos...</p></div>}
          {!isLoading && events.length === 0 && <div className="py-16 text-center"><ShieldCheck className="mx-auto mb-4 text-slate-300" size={48}/><p className="text-lg font-semibold text-slate-700">No hay eventos registrados aún</p><p className="mt-1 text-sm text-slate-500">Los eventos de tu cuenta aparecerán aquí.</p></div>}
          {!isLoading && events.length > 0 && <>
            <div className="mb-5 flex items-center gap-3"><div className="rounded-lg bg-blue-50 p-2.5 text-blue-700"><Eye size={22}/></div><h2 className="text-xl font-bold text-slate-900">{events.length} Evento{events.length !== 1 ? 's' : ''} Registrado{events.length !== 1 ? 's' : ''}</h2></div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50"><tr><th className="px-5 py-3 text-left font-semibold text-slate-700">Tipo de Evento</th><th className="px-5 py-3 text-left font-semibold text-slate-700">ID del Evento</th><th className="px-5 py-3 text-left font-semibold text-slate-700">ID de Correlación</th><th className="px-5 py-3 text-left font-semibold text-slate-700">Procesado</th></tr></thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {events.map((event) => <tr key={event.eventId} className="hover:bg-slate-50"><td className="whitespace-nowrap px-5 py-4"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">{event.eventType}</span></td><td className="px-5 py-4"><code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{event.eventId.substring(0, 12)}...</code></td><td className="px-5 py-4"><code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{event.correlationId?.substring(0, 12) || '-'}...</code></td><td className="whitespace-nowrap px-5 py-4 text-slate-600">{new Date(event.processedAt).toLocaleDateString('es-ES', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' })}</td></tr>)}
                </tbody>
              </table>
            </div>
          </>}
        </section>
      </div>
    </main>
  );
};
