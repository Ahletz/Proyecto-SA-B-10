import { create } from 'zustand';

export interface Customer {
  customerId: string;
  username: string;
  email: string;
  status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'INACTIVE';
  registeredAt: string;
  activationToken?: string;
}

export interface AuthState {
  customer: Customer | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  register: (username: string, email: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  activate: (token: string) => Promise<void>;
  logout: () => void;
  updateProfile: (email: string, password?: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  customer: null,
  token: localStorage.getItem('token') || null,
  isLoading: false,
  error: null,

  register: async (username: string, email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Registro fallido');
      }
      
      const data = await response.json();
      set({ customer: data, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al registrar';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login fallido');
      }
      
      const data = await response.json();
      localStorage.setItem('token', data.token);
      set({ token: data.token, customer: data.customer, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al iniciar sesión';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  activate: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`/api/activate/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Activación fallida');
      }
      
      const data = await response.json();
      set({ customer: data, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al activar cuenta';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ customer: null, token: null, error: null });
  },

  updateProfile: async (email: string, password?: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ email, ...(password && { password }) })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al actualizar perfil');
      }
      
      const data = await response.json();
      set({ customer: data, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar perfil';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  clearError: () => set({ error: null })
}));
