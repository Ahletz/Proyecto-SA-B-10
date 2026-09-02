import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, LogOut, Edit2, CheckCircle } from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { customer, logout, updateProfile, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [email, setEmail] = useState(customer?.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Acceso Denegado</h1>
          <p className="text-slate-600">Por favor inicia sesión primero</p>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password && password !== confirmPassword) {
      alert('Las contraseñas no coinciden');
      return;
    }

    try {
      await updateProfile(email, password || undefined);
      alert('Perfil actualizado exitosamente');
      setIsEditing(false);
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800 border border-green-300';
      case 'PENDING_ACTIVATION':
        return 'bg-yellow-100 text-yellow-800 border border-yellow-300';
      case 'INACTIVE':
        return 'bg-red-100 text-red-800 border border-red-300';
      default:
        return 'bg-slate-100 text-slate-800 border border-slate-300';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'Activa';
      case 'PENDING_ACTIVATION':
        return 'Pendiente de Activación';
      case 'INACTIVE':
        return 'Inactiva';
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-lg px-6 py-8 text-white">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold mb-2">Mi Perfil</h1>
              <p className="text-blue-100">Gestiona tu información personal</p>
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

        {/* Content */}
        <div className="bg-white rounded-b-lg shadow-xl p-6">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-6">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Profile Info Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <CheckCircle className="text-green-500" size={24} />
              Información de Cuenta
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Customer ID */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  ID de Cliente
                </label>
                <div className="px-4 py-2 border border-slate-300 rounded-lg bg-slate-50">
                  <p className="text-slate-700 font-mono">{customer.customerId}</p>
                </div>
              </div>

              {/* Username */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Usuario
                </label>
                <div className="px-4 py-2 border border-slate-300 rounded-lg bg-slate-50">
                  <p className="text-slate-700">{customer.username}</p>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Estado de Cuenta
                </label>
                <div className={`px-4 py-2 rounded-lg w-fit font-semibold ${getStatusColor(customer.status)}`}>
                  {getStatusLabel(customer.status)}
                </div>
              </div>

              {/* Registered At */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Fecha de Registro
                </label>
                <div className="px-4 py-2 border border-slate-300 rounded-lg bg-slate-50">
                  <p className="text-slate-700">
                    {new Date(customer.registeredAt).toLocaleDateString('es-ES', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Edit Section */}
          <div className="border-t pt-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Edit2 size={24} />
                Editar Información
              </h2>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                  Editar Perfil
                </button>
              )}
            </div>

            {isEditing && (
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    <Mail className="inline mr-2" size={16} />
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearError();
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                    required
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    <Lock className="inline mr-2" size={16} />
                    Nueva Contraseña (Opcional)
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearError();
                      }}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="••••••••"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-700"
                    >
                      {showPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    <Lock className="inline mr-2" size={16} />
                    Confirmar Contraseña
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      clearError();
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                    disabled={isLoading}
                  />
                </div>

                {/* Buttons */}
                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 bg-green-600 text-white font-semibold py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEmail(customer.email);
                      setPassword('');
                      setConfirmPassword('');
                      clearError();
                    }}
                    className="flex-1 bg-slate-400 text-white font-semibold py-2 rounded-lg hover:bg-slate-500 transition"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
