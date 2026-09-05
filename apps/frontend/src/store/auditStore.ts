import { create } from 'zustand';

export interface AuditEvent {
  eventId: string;
  eventType: string;
  correlationId: string;
  processedAt: string;
  payload?: Record<string, unknown>;
}

export interface AuditState {
  events: AuditEvent[];
  isLoading: boolean;
  error: string | null;
  fetchEvents: () => Promise<void>;
  clearError: () => void;
}

export const useAuditStore = create<AuditState>((set) => ({
  events: [],
  isLoading: false,
  error: null,

  fetchEvents: async () => {
    set({ isLoading: true, error: null });
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/audit/events', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Error al obtener auditoría');
      }
      
      const data = await response.json();
      set({ events: data, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al obtener auditoría';
      set({ error: message, isLoading: false });
    }
  },

  clearError: () => set({ error: null })
}));
