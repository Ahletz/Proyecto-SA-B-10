import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';

export const ActivationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Activando tu cuenta...');

  const { activate } = useAuthStore();

  useEffect(() => {
    const token = searchParams.get('token');
    
    if (!token) {
      setStatus('error');
      setMessage('Token de activación no encontrado');
      return;
    }

    const performActivation = async () => {
      try {
        await activate(token);
        setStatus('success');
        setMessage('¡Tu cuenta ha sido activada exitosamente!');
        setTimeout(() => navigate('/login'), 2000);
      } catch (err) {
        setStatus('error');
        const errorMsg = err instanceof Error ? err.message : 'Error al activar cuenta';
        setMessage(errorMsg);
      }
    };

    performActivation();
  }, [searchParams, activate, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-8">
            <h1 className="text-3xl font-bold text-white mb-2">Banco USAC</h1>
            <p className="text-blue-100">Activación de cuenta</p>
          </div>

          {/* Content */}
          <div className="p-6 flex flex-col items-center justify-center min-h-64">
            {status === 'loading' && (
              <>
                <Loader className="w-16 h-16 text-blue-600 animate-spin mb-4" />
                <p className="text-slate-600 text-center">{message}</p>
              </>
            )}

            {status === 'success' && (
              <>
                <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
                <p className="text-slate-700 text-center font-semibold mb-4">{message}</p>
                <p className="text-slate-500 text-sm text-center">
                  Redirigiendo a inicio de sesión...
                </p>
              </>
            )}

            {status === 'error' && (
              <>
                <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
                <p className="text-red-700 text-center font-semibold mb-4">{message}</p>
                <button
                  onClick={() => navigate('/login')}
                  className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                  Ir al Login
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
