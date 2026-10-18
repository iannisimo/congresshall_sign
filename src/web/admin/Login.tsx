import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { SessionUser } from '../../shared/model.ts';
import logo from '../assets/logo-small.svg';
import { api, errorMessage, keys, queryClient } from './api.ts';
import { Button, ErrorNote, Field, inputClass } from './ui.tsx';

export default function Login() {
  const [username, setUsername] = useState('admin');
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
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-900/5">
        <img src={logo} alt="" className="mx-auto mb-6 h-14" />
        <h1 className="mb-6 text-center text-lg font-semibold text-slate-900">Gestione del cartello</h1>
        <div className="space-y-4">
          <Field label="Utente">
            <select className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)}>
              <option value="admin">admin</option>
              <option value="superadmin">superadmin</option>
            </select>
          </Field>
          <Field label="Password">
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {login.isError && <ErrorNote>{errorMessage(login.error)}</ErrorNote>}
          <Button type="submit" variant="primary" className="w-full" busy={login.isPending}>
            Accedi
          </Button>
        </div>
      </form>
    </div>
  );
}
