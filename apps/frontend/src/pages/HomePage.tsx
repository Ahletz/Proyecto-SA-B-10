import React from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, BarChart3, Home } from 'lucide-react';

export const HomePage: React.FC = () => {
  const { customer, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (customer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg px-6 py-8 text-white mb-8">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-4xl font-bold mb-2">Bienvenido, {customer.username}!</h1>
                <p className="text-blue-100">Sistema de Gestión Bancaria USAC</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg transition"
              >
                <LogOut size={20} />
                Cerrar Sesión
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Profile Card */}
            <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Mi Perfil</h3>
                  <p className="text-slate-600 text-sm">Gestiona tu información personal</p>
                </div>
                <User className="text-blue-600" size={32} />
              </div>
              <div className="space-y-2 mb-4 text-sm text-slate-600">
                <p><strong>Cliente:</strong> {customer.customerId}</p>
                <p><strong>Usuario:</strong> {customer.username}</p>
                <p><strong>Email:</strong> {customer.email}</p>
              </div>
              <button
                onClick={() => navigate('/profile')}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-semibold"
              >
                Ver Perfil
              </button>
            </div>

            {/* Audit Card */}
            <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Auditoría</h3>
                  <p className="text-slate-600 text-sm">Historial de eventos procesados</p>
                </div>
                <BarChart3 className="text-green-600" size={32} />
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Revisa todos los eventos registrados en tu cuenta para mantener un control total.
              </p>
              <button
                onClick={() => navigate('/audit')}
                className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition font-semibold"
              >
                Ver Auditoría
              </button>
            </div>
          </div>

          {/* Info Section */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Home size={28} />
              Tu Cuenta
            </h2>

            <div className="grid md:grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-slate-600 text-sm mb-2">Estado de Cuenta</p>
                <p className={`text-2xl font-bold ${
                  customer.status === 'ACTIVE' ? 'text-green-600' : 'text-yellow-600'
                }`}>
                  {customer.status === 'ACTIVE' ? '✓ Activa' : '⏳ Pendiente'}
                </p>
              </div>
              <div>
                <p className="text-slate-600 text-sm mb-2">Fecha de Registro</p>
                <p className="text-lg font-semibold text-slate-700">
                  {new Date(customer.registeredAt).toLocaleDateString('es-ES')}
                </p>
              </div>
              <div>
                <p className="text-slate-600 text-sm mb-2">ID de Cliente</p>
                <p className="text-sm font-mono text-slate-700 bg-slate-100 px-3 py-1 rounded inline-block">
                  {customer.customerId}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-bold text-slate-800 mb-4">Banco USAC</h1>
        <p className="text-slate-600 mb-8">Sistema de Gestión Bancaria</p>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition"
          >
            Iniciar Sesión
          </button>
          <button
            onClick={() => navigate('/register')}
            className="w-full bg-slate-600 text-white font-semibold py-3 rounded-lg hover:bg-slate-700 transition"
          >
            Crear Cuenta
          </button>
        </div>
      </div>
    </div>
  );
};
