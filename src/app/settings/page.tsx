import { permanentRedirect } from "next/navigation";

/** Old links and bookmarks keep working after the move to /account. */
export default function SettingsRoute() {
  permanentRedirect("/account");
}
