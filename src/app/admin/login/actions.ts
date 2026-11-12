"use server";

import { AuthError } from "next-auth";

import { ADMIN_PROVIDER_ID, signIn } from "@/auth";

/** `username` is echoed back because React resets the form after every action, and retyping it is friction. */
export type AdminSignInState = { error: string | null; username: string };

export async function signInAsAdmin(_previous: AdminSignInState, formData: FormData): Promise<AdminSignInState> {
  const username = String(formData.get("username") ?? "");
  try {
    await signIn(ADMIN_PROVIDER_ID, {
      username,
      password: formData.get("password"),
      redirectTo: "/admin",
    });
    return { error: null, username };
  } catch (error) {
    // signIn redirects by throwing; only Auth.js failures become a form error.
    if (error instanceof AuthError) return { error: "Wrong username or password, or too many attempts.", username };
    throw error;
  }
}
