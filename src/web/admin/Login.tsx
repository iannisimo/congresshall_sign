import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { SessionUser } from '../../shared/model.ts';
import { VenueLogo } from '../sign/parts.tsx';
import { api, errorMessage, keys, queryClient, useDisplay } from './api.ts';
import { Button, ErrorNote, inputClass } from './ui.tsx';

export default function Login() {
  const [username, setUsername] = useState('');
  const display = useDisplay();
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => api<SessionUser>('/auth/login', { method: 'POST', json: { username, password } }),
    onSuccess: (user) => queryClient.setQueryData(keys.me, user),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form method="post" onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-900/5">
        <VenueLogo version={display.data?.venueLogo ?? null} className="mx-auto mb-6 h-14" />
        <h1 className="mb-6 text-center text-lg font-semibold text-slate-900">Gestione del cartello</h1>
        <div className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-slate-700">
              Utente
            </label>
            <input
              className={inputClass}
              type="text"
              name="username"
              id="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              list="login-usernames"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <datalist id="login-usernames">
              <option value="admin" />
              <option value="superadmin" />
              <option value="media" />
            </datalist>
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              className={inputClass}
              type="password"
              name="password"
              id="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {login.isError && <ErrorNote>{errorMessage(login.error)}</ErrorNote>}
          <Button type="submit" variant="primary" className="w-full" busy={login.isPending}>
            Accedi
          </Button>
        </div>
      </form>
    </div>
  );
}
