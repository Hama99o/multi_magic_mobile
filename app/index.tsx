/**
 * The only decision at launch: signed in or not.
 *
 * `_layout` has already resolved `status` from the keystore before this
 * renders, so there is no third "still deciding" state to flash here.
 */
import { Redirect } from "expo-router";
import { useAuthStore } from "@/stores/auth.store";

export default function Index() {
  const status = useAuthStore((s) => s.status);
  return <Redirect href={status === "signedIn" ? "/chat" : "/sign-in"} />;
}
