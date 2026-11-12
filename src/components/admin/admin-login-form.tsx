"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";

import type { AdminSignInState } from "@/app/admin/login/actions";
import { Button } from "@/components/ui/button";

const INPUT_CLASS =
  "h-10 rounded-lg border border-input bg-card/60 px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 ease-out focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

export type AdminLoginFormProps = {
  signInAction: (previous: AdminSignInState, formData: FormData) => Promise<AdminSignInState>;
};

export function AdminLoginForm({ signInAction }: AdminLoginFormProps) {
  const [state, formAction, pending] = useActionState(signInAction, { error: null, username: "" });
  const invalid = state.error !== null;

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-5">
      <label className="flex flex-col gap-1.5 text-[0.8rem] font-medium">
        Username
        <input
          name="username"
          defaultValue={state.username}
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={invalid}
          className={INPUT_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[0.8rem] font-medium">
        Password
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          aria-invalid={invalid}
          aria-describedby={invalid ? "admin-login-error" : undefined}
          className={INPUT_CLASS}
        />
      </label>
      {invalid && (
        <p id="admin-login-error" role="alert" className="text-[0.8rem] text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} aria-busy={pending} className="h-10">
        {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
