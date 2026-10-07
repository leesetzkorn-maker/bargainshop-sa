"use client";

import { useActionState } from "react";
import { loginAction, type AdminFormState } from "@/app/actions/admin";

const initial: AdminFormState = { ok: false };

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} className="card space-y-4 p-6">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {state.error}
        </p>
      ) : null}
      <label className="block">
        <span className="label">Email</span>
        <input
          className="input"
          name="email"
          type="email"
          autoComplete="username"
          required
          aria-invalid={state.fieldErrors?.email ? true : undefined}
        />
        {state.fieldErrors?.email ? <span className="error-text">{state.fieldErrors.email[0]}</span> : null}
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input
          className="input"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.fieldErrors?.password ? true : undefined}
        />
        {state.fieldErrors?.password ? <span className="error-text">{state.fieldErrors.password[0]}</span> : null}
      </label>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
