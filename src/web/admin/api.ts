import { keepPreviousData, MutationCache, QueryCache, QueryClient, useQuery } from '@tanstack/react-query';
import type { Conflict, DisplaySnapshot, Organizer, Room, ScheduledEvent, SessionUser, Settings } from '../../shared/model.ts';

export interface ConflictReport {
  /** Position of the event in the request. */
  index: number;
  conflicts: Conflict[];
}

export interface ErrorBody {
  error: string;
  issues?: { path: string; message: string }[];
  conflicts?: ConflictReport[];
}

export class HttpError extends Error {
  readonly status: number;
  readonly body: ErrorBody | null;

  constructor(status: number, body: ErrorBody | null) {
    super(body?.error ?? `Errore ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(path: string, options: { method?: string; json?: unknown; form?: FormData } = {}): Promise<T> {
  const { method = 'GET', json, form } = options;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: json === undefined ? {} : { 'Content-Type': 'application/json' },
      body: json === undefined ? form : JSON.stringify(json),
    });
  } catch {
    throw new HttpError(0, { error: 'Server non raggiungibile: controlla la connessione' });
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new HttpError(response.status, body as ErrorBody | null);
  return body as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Errore imprevisto';
}

export const keys = {
  me: ['me'] as const,
  rooms: ['rooms'] as const,
  organizers: ['organizers'] as const,
  display: ['display'] as const,
  settings: ['settings'] as const,
  events: (from: number, to: number) => ['events', from, to] as const,
  event: (id: number) => ['event', id] as const,
};

/** Any 401 means the session is over: forget the user so the login page shows. */
function onError(error: unknown) {
  if (error instanceof HttpError && error.status === 401) queryClient.setQueryData(keys.me, null);
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: (count, error) => !(error instanceof HttpError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

/** Everything that depends on the schedule. */
export function refreshSchedule(): void {
  void queryClient.invalidateQueries({ queryKey: ['events'] });
  void queryClient.invalidateQueries({ queryKey: ['event'] });
  void queryClient.invalidateQueries({ queryKey: keys.display });
  void queryClient.invalidateQueries({ queryKey: keys.organizers });
}

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api<SessionUser>('/auth/me');
      } catch (error) {
        if (error instanceof HttpError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: Infinity,
  });
}

export const useRooms = () => useQuery({ queryKey: keys.rooms, queryFn: () => api<Room[]>('/rooms') });

export const useOrganizers = () => useQuery({ queryKey: keys.organizers, queryFn: () => api<Organizer[]>('/organizers') });

/** `keepPrevious` shows the previous range while the next loads, e.g. while times are being typed. */
export const useEvents = (from: number, to: number, options: { enabled?: boolean; keepPrevious?: boolean } = {}) =>
  useQuery({
    queryKey: keys.events(from, to),
    queryFn: () => api<ScheduledEvent[]>(`/events?from=${from}&to=${to}`),
    enabled: options.enabled ?? true,
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
  });

export const useEvent = (id: number | undefined) =>
  useQuery({ queryKey: keys.event(id ?? 0), queryFn: () => api<ScheduledEvent>(`/events/${id}`), enabled: id !== undefined });

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => api<Settings>('/settings') });

/** Same data as the sign, for the current room statuses. */
export const useDisplay = () =>
  useQuery({ queryKey: keys.display, queryFn: () => api<DisplaySnapshot>('/display'), refetchInterval: 30_000 });

export function ddgLogoSearch(term: string): string {
  const q = encodeURIComponent(`logo ${term}`);
  return `https://duckduckgo.com/?q=${q}&iax=images&ia=images&iaf=type%3Atransparent`;
}
