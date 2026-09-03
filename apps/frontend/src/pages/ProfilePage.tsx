import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, LogOut, Edit2, CheckCircle, Eye, EyeOff, User, ArrowLeft } from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { customer, logout, updateProfile, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [email, setEmail] = useState(customer?.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (!customer) return <div className="flex min-h-screen items-center justify-center bg-slate-100"><div className="text-center"><h1 className="text-2xl font-bold text-slate-900">Acceso Denegado</h1><p className="mt-2 text-slate-600">Por favor inicia sesión primero.</p></div></div>;
  const handleLogout = () => { logout(); navigate('/login'); };
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password && password !== confirmPassword) { alert('Las contraseñas no coinciden'); return; }
    try { await updateProfile(email, password || undefined); alert('Perfil actualizado exitosamente'); setIsEditing(false); setPassword(''); setConfirmPassword(''); } catch (err) { console.error('Error:', err); }
  };
  const getStatus = (status: string) => status === 'ACTIVE' ? { label:'Activa', cls:'bg-emerald-50 text-emerald-700 ring-emerald-200' } : status === 'PENDING_ACTIVATION' ? { label:'Pendiente de Activación', cls:'bg-amber-50 text-amber-700 ring-amber-200' } : status === 'INACTIVE' ? { label:'Inactiva', cls:'bg-red-50 text-red-700 ring-red-200' } : { label:status, cls:'bg-slate-50 text-slate-700 ring-slate-200' };
  const status = getStatus(customer.status);
  const inputClass = 'w-full rounded-lg border border-slate-300 bg-white py-3 px-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100';

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-2xl bg-blue-950 p-6 text-white shadow-lg sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="mb-2 text-sm font-semibold uppercase tracking-widest text-cyan-300">Banco USAC</p><h1 className="text-3xl font-bold">Mi Perfil</h1><p className="mt-2 text-blue-100">Gestiona tu información personal.</p></div>
            <button onClick={handleLogout} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white hover:bg-red-700"><LogOut size={18}/> Cerrar Sesión</button>
          </div>
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-200 sm:p-8">
          {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
          <div className="mb-8">
            <div className="mb-6 flex items-center gap-3"><div className="rounded-lg bg-blue-50 p-2.5 text-blue-700"><User size={22}/></div><div><h2 className="text-xl font-bold text-slate-900">Información de Cuenta</h2><p className="text-sm text-slate-500">Datos asociados a tu cuenta.</p></div></div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ID de Cliente</p><p className="mt-2 break-all font-mono text-sm text-slate-800">{customer.customerId}</p></div>
              <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Usuario</p><p className="mt-2 font-medium text-slate-800">{customer.username}</p></div>
              <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado de Cuenta</p><span className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-semibold ring-1 ${status.cls}`}>{status.label}</span></div>
              <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha de Registro</p><p className="mt-2 text-sm font-medium text-slate-800">{new Date(customer.registeredAt).toLocaleDateString('es-ES', {year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit'})}</p></div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-8">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Edit2 size={20}/> Editar Información</h2><p className="mt-1 text-sm text-slate-500">Actualiza tu correo o contraseña.</p></div>{!isEditing && <button onClick={() => setIsEditing(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800"><Edit2 size={17}/> Editar Perfil</button>}</div>
            {isEditing && <form onSubmit={handleUpdateProfile} className="space-y-5">
              <div><label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Correo electrónico</label><div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input id="email" type="email" value={email} onChange={(e)=>{setEmail(e.target.value);clearError();}} className={`${inputClass} pl-10`} disabled={isLoading} required/></div></div>
              <div><label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Nueva Contraseña (Opcional)</label><div className="relative"><Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input id="password" type={showPassword?'text':'password'} value={password} onChange={(e)=>{setPassword(e.target.value);clearError();}} className={`${inputClass} pl-10 pr-11`} placeholder="••••••••" disabled={isLoading}/><button type="button" onClick={()=>setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label={showPassword?'Ocultar contraseña':'Mostrar contraseña'}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></div>
              <div><label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-slate-700">Confirmar Contraseña</label><div className="relative"><Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input id="confirmPassword" type={showPassword?'text':'password'} value={confirmPassword} onChange={(e)=>{setConfirmPassword(e.target.value);clearError();}} className={`${inputClass} pl-10`} placeholder="••••••••" disabled={isLoading}/></div></div>
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row"><button type="button" onClick={()=>{setIsEditing(false);setEmail(customer.email);setPassword('');setConfirmPassword('');clearError();}} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"><ArrowLeft size={17}/> Cancelar</button><button type="submit" disabled={isLoading} className="flex-1 rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{isLoading?'Guardando...':'Guardar Cambios'}</button></div>
            </form>}
          </div>
        </section>

        <div className="flex justify-center"><button onClick={() => navigate('/audit')} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"><CheckCircle size={17}/> Ver auditoría</button></div>
      </div>
    </main>
  );
};
