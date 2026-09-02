import React, { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { useAuditStore } from '../store/auditStore';
import { Eye, LogOut, Loader, AlertCircle } from 'lucide-react';

export const AuditPage: React.FC = () => {
  const { customer, logout } = useAuthStore();
  const { events, isLoading, error, fetchEvents } = useAuditStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (customer) {
      fetchEvents();
    }
  }, [customer, fetchEvents]);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-lg px-6 py-8 text-white">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold mb-2">Auditoría de Eventos</h1>
              <p className="text-blue-100">Historial de eventos procesados en tu cuenta</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/profile')}
                className="bg-blue-400 hover:bg-blue-500 px-4 py-2 rounded-lg transition"
              >
                Mi Perfil
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg transition"
              >
                <LogOut size={20} />
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-b-lg shadow-xl p-6">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-6 flex items-start gap-3">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-1" size={20} />
              <div>
                <p className="text-red-700 font-semibold">Error al cargar auditoría</p>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 text-blue-600 animate-spin mr-3" />
              <p className="text-slate-600">Cargando eventos...</p>
            </div>
          )}

          {!isLoading && events.length === 0 && (
            <div className="text-center py-12">
              <Eye className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-lg">No hay eventos registrados aún</p>
              <p className="text-slate-400 text-sm mt-1">
                Los eventos de tu cuenta aparecerán aquí
              </p>
            </div>
          )}

          {!isLoading && events.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Eye size={24} />
                {events.length} Evento{events.length !== 1 ? 's' : ''} Registrado{events.length !== 1 ? 's' : ''}
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-slate-300">
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Tipo de Evento</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">ID del Evento</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">ID de Correlación</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Procesado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr
                        key={event.eventId}
                        className="border-b border-slate-200 hover:bg-slate-50 transition"
                      >
                        <td className="py-3 px-4">
                          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                            {event.eventType}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <code className="text-xs font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded">
                            {event.eventId.substring(0, 12)}...
                          </code>
                        </td>
                        <td className="py-3 px-4">
                          <code className="text-xs font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded">
                            {event.correlationId?.substring(0, 12) || '-'}...
                          </code>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-slate-600">
                            {new Date(event.processedAt).toLocaleDateString('es-ES', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
