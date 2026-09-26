import { useState } from 'react';
import { api } from '../api/legacy';
import type { User } from '../types';
import type * as React from 'react';

export function Login({
  theme,
  onLogin
}: {
  theme: string;
  onLogin: (user: User) => void;
}) {
  const [
    identity,
    setIdentity
  ] = useState(
    'analyst@geoai.demo'
  );

  const [
    password,
    setPassword
  ] = useState('');

  const [
    error,
    setError
  ] = useState('');

  const submit = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    try {
      const data = await api(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            email: identity,
            password
          })
        }
      );

      onLogin(data.user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Sign-in failed'
      );
    }
  };

  return (
    <main
      className={`auth-screen theme-${theme}`}
    >
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">
            G
          </span>{' '}
          GEOAI <b>PLATFORM</b>
        </div>

        <p className="auth-eyebrow">
          SECURE GEOSPATIAL WORKSTATION
        </p>

        <h1>Welcome back</h1>

        <p className="auth-sub">
          Authenticate to access the
          protected intelligence workspace.
        </p>

        <form onSubmit={submit}>
          <label>
            Email or username
            <input
              value={identity}
              onChange={e =>
                setIdentity(
                  e.target.value
                )
              }
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={e =>
                setPassword(
                  e.target.value
                )
              }
              autoFocus
            />
          </label>

          {error && (
            <p className="auth-error">
              {error}
            </p>
          )}

          <button className="auth-submit">
            SIGN IN
          </button>
        </form>

        <div className="demo-credentials">
          <b>
            DEMO AUTHENTICATION
          </b>
          <span>
            analyst@geoai.demo · password:
            geoai-demo
          </span>
        </div>
      </section>
    </main>
  );
}