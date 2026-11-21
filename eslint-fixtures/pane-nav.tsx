// Fails "pane-nav" twice: the router singleton and useLocalSearchParams, imported by a screen.
import { router, useLocalSearchParams, type Href } from "expo-router";

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return id ? router.push("/notes" as Href) : null;
}
