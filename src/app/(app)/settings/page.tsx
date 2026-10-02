import { redirect } from "next/navigation";

/** `/settings` has no content of its own; the first tab is the issuer profiles. */
export default function SettingsIndexPage(): never {
  redirect("/settings/profiles");
}
