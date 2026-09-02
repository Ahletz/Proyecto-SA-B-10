import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { login, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(username, password);
      navigate('/profile');
    } catch (err) {
      console.error('Error:', err);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center">
        <section className="w-full overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
          <div className="bg-blue-950 px-6 py-8 text-white sm:px-8">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-cyan-300">Banco USAC</p>
            <h1 className="text-3xl font-bold tracking-tight">Iniciar sesión</h1>
            <p className="mt-2 text-sm text-blue-100">Accede a tu cuenta bancaria.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-6 sm:p-8">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-700">Usuario</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); clearError(); }}
                  className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  placeholder="Tu usuario"
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Contraseña</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError(); }}
                  className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-11 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  placeholder="••••••••"
                  disabled={isLoading}
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              {!isLoading && <ArrowRight size={18} />}
            </button>

            <p className="text-center text-sm text-slate-600">
              ¿No tienes cuenta?{' '}
              <a href="/register" className="font-semibold text-blue-700 hover:text-blue-900">Regístrate</a>
            </p>
          </form>
        </section>
      </div>
    </main>
  );
};
