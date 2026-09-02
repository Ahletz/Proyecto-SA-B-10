import React from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, BarChart3, Home, ArrowRight, ShieldCheck } from 'lucide-react';

export const HomePage: React.FC = () => {
  const { customer, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  if (customer) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="rounded-2xl bg-blue-950 p-6 text-white shadow-lg sm:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-cyan-300">Banco USAC</p>
                <h1 className="text-3xl font-bold sm:text-4xl">Bienvenido, {customer.username}</h1>
                <p className="mt-2 text-blue-100">Sistema de Gestión Bancaria</p>
              </div>
              <button onClick={handleLogout} className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 font-semibold text-blue-950 shadow-sm transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-950">
                <LogOut size={18} /> Cerrar Sesión
              </button>
            </div>
          </header>

          <section className="grid gap-6 md:grid-cols-2">
            <article className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-200">
              <div className="mb-6 flex items-start justify-between">
                <div><h2 className="text-xl font-bold text-slate-900">Mi Perfil</h2><p className="mt-1 text-sm text-slate-500">Gestiona tu información personal.</p></div>
                <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><User size={25} /></div>
              </div>
              <dl className="mb-6 space-y-3 text-sm">
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">Cliente</dt><dd className="font-mono text-right text-slate-800">{customer.customerId}</dd></div>
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">Usuario</dt><dd className="font-medium text-slate-800">{customer.username}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Email</dt><dd className="break-all text-right font-medium text-slate-800">{customer.email}</dd></div>
              </dl>
              <button onClick={() => navigate('/profile')} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Ver Perfil <ArrowRight size={18} /></button>
            </article>

            <article className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-200">
              <div className="mb-6 flex items-start justify-between">
                <div><h2 className="text-xl font-bold text-slate-900">Auditoría</h2><p className="mt-1 text-sm text-slate-500">Historial de eventos procesados.</p></div>
                <div className="rounded-xl bg-cyan-50 p-3 text-cyan-700"><BarChart3 size={25} /></div>
              </div>
              <p className="mb-6 min-h-12 text-sm leading-6 text-slate-600">Consulta los eventos registrados en tu cuenta y mantén un control de la actividad.</p>
              <button onClick={() => navigate('/audit')} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-3 font-semibold text-white transition hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2">Ver Auditoría <ArrowRight size={18} /></button>
            </article>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-200 sm:p-8">
            <div className="mb-6 flex items-center gap-3"><div className="rounded-xl bg-blue-50 p-3 text-blue-700"><Home size={24} /></div><div><h2 className="text-xl font-bold text-slate-900">Resumen de tu cuenta</h2><p className="text-sm text-slate-500">Información general del cliente.</p></div></div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5"><p className="text-sm text-slate-500">Estado de Cuenta</p><p className={`mt-2 text-xl font-bold ${customer.status === 'ACTIVE' ? 'text-emerald-600' : 'text-amber-600'}`}>{customer.status === 'ACTIVE' ? '✓ Activa' : '⏳ Pendiente'}</p></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5"><p className="text-sm text-slate-500">Fecha de Registro</p><p className="mt-2 font-semibold text-slate-800">{new Date(customer.registeredAt).toLocaleDateString('es-ES')}</p></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5"><p className="text-sm text-slate-500">ID de Cliente</p><p className="mt-2 break-all font-mono text-sm text-slate-800">{customer.customerId}</p></div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-lg items-center justify-center">
        <section className="w-full rounded-2xl bg-white p-8 text-center shadow-xl ring-1 ring-slate-200 sm:p-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-950 text-cyan-300"><ShieldCheck size={32} /></div>
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Banco USAC</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900">Sistema de Gestión Bancaria</h1>
          <p className="mt-4 text-slate-600">Inicia sesión o crea una cuenta para continuar.</p>
          <div className="mt-8 grid gap-3">
            <button onClick={() => navigate('/login')} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Iniciar Sesión</button>
            <button onClick={() => navigate('/register')} className="w-full rounded-lg border border-blue-700 bg-white px-4 py-3 font-semibold text-blue-800 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Crear Cuenta</button>
          </div>
        </section>
      </div>
    </main>
  );
};
