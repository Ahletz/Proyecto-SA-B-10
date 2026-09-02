import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { Mail, Lock, User, Eye, EyeOff, UserPlus } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { register, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert('Las contraseñas no coinciden');
      return;
    }
    try {
      await register(username, email, password);
      alert('¡Registro exitoso! Revisa tu correo para activar tu cuenta.');
      setUsername('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const inputClass = 'w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100';

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center">
        <section className="w-full overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
          <div className="bg-blue-950 px-6 py-8 text-white sm:px-8">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-cyan-300">Banco USAC</p>
            <h1 className="text-3xl font-bold tracking-tight">Crear cuenta</h1>
            <p className="mt-2 text-sm text-blue-100">Completa tus datos para registrarte.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-6 sm:p-8">
            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</div>}

            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-700">Usuario</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input id="username" type="text" value={username} onChange={(e) => { setUsername(e.target.value); clearError(); }} className={inputClass} placeholder="Nombre de usuario" disabled={isLoading} required />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Correo electrónico</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input id="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); clearError(); }} className={inputClass} placeholder="tu@correo.com" disabled={isLoading} required />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Contraseña</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => { setPassword(e.target.value); clearError(); }} className={`${inputClass} pr-11`} placeholder="••••••••" disabled={isLoading} required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-slate-700">Confirmar contraseña</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input id="confirmPassword" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); clearError(); }} className={inputClass} placeholder="••••••••" disabled={isLoading} required />
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
              {isLoading ? 'Registrando...' : 'Crear Cuenta'}
              {!isLoading && <UserPlus size={18} />}
            </button>

            <p className="text-center text-sm text-slate-600">¿Ya tienes cuenta? <a href="/login" className="font-semibold text-blue-700 hover:text-blue-900">Inicia sesión</a></p>
          </form>
        </section>
      </div>
    </main>
  );
};
