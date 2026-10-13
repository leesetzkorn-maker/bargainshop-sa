"use client";

import { useActionState } from "react";
import { startR20PaymentTest, type R20TestState } from "@/app/admin/(panel)/payment-test/actions";

const initial: R20TestState = { error: "" };

export function R20PaymentButton() {
  const [state, action, pending] = useActionState(startR20PaymentTest, initial);
  return (
    <form action={action}>
      <button type="submit" disabled={pending} className="btn btn-primary btn-lg">
        {pending ? "Opening Yoco checkout..." : "Pay R20 — start private test"}
      </button>
      {state.error ? <p role="alert" className="mt-3 text-sm text-danger-700">{state.error}</p> : null}
    </form>
  );
}
