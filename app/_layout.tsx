/**
 * The root. Wires the 401 handler once, restores a session if there is one, and
 * holds the splash until that answer is known.
 *
 * The order matters: `wireAuthStore()` runs before anything can make a request,
 * because a 401 arriving with no handler clears the token and leaves the app on
 * a screen that silently fails every call afterwards.
 */
import "@/styles/global.css";
import { useEffect, useState } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import { wireAuthStore, useAuthStore } from "@/stores/auth.store";
import { wireReachability } from "@/stores/reachability.store";
import { useThemeStore } from "@/stores/theme.store";
import { useScheme } from "@/hooks/useColors";
import { loadToken } from "@/api/http";
import { TOKENS } from "@/theme/tokens";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The assistant's data changes because the user changed it, not because
      // time passed. Refetching on every focus would re-read a transcript the
      // socket is already keeping current.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

wireAuthStore();
wireReachability();

export default function RootLayout() {
  /**
   * The STORE's answer, not the phone's. Every View resolves its colours
   * through `useColors()`, which reads the theme chooser; this used to read
   * `useColorScheme()` directly, so somebody who chose Dark on a light phone
   * got a #102125 ground under a status bar drawn in dark glyphs — invisible —
   * and a light Stack background flashing between screens. Two sources of
   * truth for one question, and they disagreed exactly when the chooser was
   * used.
   */
  const scheme = useScheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      // A token in the keystore means a session to restore. Anything else —
      // including a keystore that cannot be read — means signed out, which is
      // recoverable by signing in.
      // The theme is read BEFORE the first paint. A theme that arrives a frame
      // late is a white flash on a dark app, which is the one moment it is most
      // obvious.
      await useThemeStore.getState().hydrate();
      const token = await loadToken();
      useAuthStore.setState({ status: token ? "signedIn" : "signedOut" });
      setReady(true);
      await SplashScreen.hideAsync();
    })();
  }, []);

  /**
   * A 401 mid-session clears the token (`http.ts`) and flips the store
   * (`auth.store`) — and until this effect, NOBODY NAVIGATED. `index.tsx`
   * redirects at launch only, so the chat stayed on screen with every request
   * failing and nothing to say why. The root watches the store instead: a
   * FORCED sign-out — the one that carries a reason — goes to sign-in, where
   * the reason is said. A deliberate sign-out carries none and navigates
   * itself, so this never fires twice for one departure.
   */
  useEffect(
    () =>
      useAuthStore.subscribe((state, previous) => {
        if (
          state.status === "signedOut" &&
          previous.status === "signedIn" &&
          state.signedOutReason
        ) {
          router.replace("/sign-in");
        }
      }),
    [],
  );

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style={scheme === "light" ? "dark" : "light"} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: TOKENS[scheme].ground,
            },
          }}
        />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
