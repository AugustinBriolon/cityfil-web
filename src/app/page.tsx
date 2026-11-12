import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LandingPage } from "@/components/landing/landing-page";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Cityfil · Run every street in your city",
  description:
    "Cityfil turns your Strava runs into the share of each city you've conquered, then plans a run through the streets you haven't.",
};

export default async function HomePage() {
  if (await getCurrentUser()) redirect("/globe");
  return <LandingPage />;
}
