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
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import { wireAuthStore, useAuthStore } from "@/stores/auth.store";
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

export default function RootLayout() {
  const scheme = useColorScheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      // A token in the keystore means a session to restore. Anything else —
      // including a keystore that cannot be read — means signed out, which is
      // recoverable by signing in.
      const token = await loadToken();
      useAuthStore.setState({ status: token ? "signedIn" : "signedOut" });
      setReady(true);
      await SplashScreen.hideAsync();
    })();
  }, []);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style={scheme === "light" ? "dark" : "light"} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: TOKENS[scheme === "light" ? "light" : "dark"].ground,
            },
          }}
        />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
