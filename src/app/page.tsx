import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LandingPage } from "@/components/landing/landing-page";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Cityfil · Every street you've run, on one map",
  description:
    "Connect Strava and Cityfil shows how much of each city you've already run, then plans a route through the streets you haven't.",
};

export default async function HomePage() {
  if (await getCurrentUser()) redirect("/globe");
  return <LandingPage />;
}
