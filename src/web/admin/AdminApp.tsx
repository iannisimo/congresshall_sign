import { QueryClientProvider, useMutation } from '@tanstack/react-query';
import { CalendarDays, DoorOpen, ExternalLink, LogOut, Settings as SettingsIcon, Users } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router';
import logo from '../assets/logo-small.svg';
import { installUpdate, onUpdateWaiting } from '../lib/pwa.ts';
import { api, keys, queryClient, useMe } from './api.ts';
import DayView from './DayView.tsx';
import EventEditor from './EventEditor.tsx';
import Login from './Login.tsx';
import Organizers from './Organizers.tsx';
import Rooms from './Rooms.tsx';
import Settings from './Settings.tsx';
import { Button, FeedbackProvider, PageLoading } from './ui.tsx';

function NavItem({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/admin'}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${isActive ? 'bg-brand-50 text-brand-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}

/** Offers the new version instead of reloading by itself, so a half-filled form is never lost. */
function UpdateBanner() {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => onUpdateWaiting(() => setWaiting(true)), []);
  if (!waiting) return null;
  return (
    <div className="flex items-center justify-center gap-3 bg-brand-900 px-4 py-2 text-sm text-white">
      È disponibile una nuova versione.
      <button type="button" onClick={installUpdate} className="rounded-md bg-white/15 px-2.5 py-1 font-medium hover:bg-white/25">
        Aggiorna
      </button>
    </div>
  );
}

function Shell({ superadmin, username, children }: { superadmin: boolean; username: string; children: ReactNode }) {
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      // Forgetting the user shows the login page. Don't clear the whole cache: that would detach the
      // page from the user query, so it would never see the change.
      queryClient.setQueryData(keys.me, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== keys.me[0] });
      navigate('/admin', { replace: true });
    },
  });

  return (
    <div className="min-h-screen">
      <UpdateBanner />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 sm:px-6">
          <img src={logo} alt="" className="hidden h-9 sm:block" />
          <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1">
            <NavItem to="/admin" icon={<CalendarDays className="size-4" />}>
              Programma
            </NavItem>
            <NavItem to="/admin/organizers" icon={<Users className="size-4" />}>
              Organizzatori
            </NavItem>
            {superadmin && (
              <>
                <NavItem to="/admin/rooms" icon={<DoorOpen className="size-4" />}>
                  Sale
                </NavItem>
                <NavItem to="/admin/settings" icon={<SettingsIcon className="size-4" />}>
                  Impostazioni
                </NavItem>
              </>
            )}
          </nav>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 md:flex"
          >
            Cartello <ExternalLink className="size-3.5" />
          </a>
          <Button variant="ghost" size="sm" onClick={() => logout.mutate()} title={`Esci (${username})`}>
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Esci</span>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

function Gate() {
  const me = useMe();
  if (me.isPending) return <PageLoading />;
  if (!me.data) return <Login />;

  const superadmin = me.data.role === 'superadmin';
  return (
    <Shell superadmin={superadmin} username={me.data.username}>
      <Routes>
        <Route index element={<DayView />} />
        <Route path="events/new" element={<EventEditor mode="new" />} />
        <Route path="events/:id" element={<EventEditor mode="edit" />} />
        <Route path="events/:id/clone" element={<EventEditor mode="clone" />} />
        <Route path="organizers" element={<Organizers />} />
        {superadmin && <Route path="rooms" element={<Rooms />} />}
        {superadmin && <Route path="settings" element={<Settings />} />}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Shell>
  );
}

export default function AdminApp() {
  useEffect(() => {
    document.title = 'Gestione · Centro Congressi';
    document.documentElement.lang = 'it';
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <FeedbackProvider>
        <Gate />
      </FeedbackProvider>
    </QueryClientProvider>
  );
}
