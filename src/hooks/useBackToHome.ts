/**
 * BACK TO THE APP GRID from an app's root screen (owner, TestFlight 1.2.0,
 * 2026-11-15: "no option to go back to the menu where we select the app").
 * The same rule Notes has (`app/notes/index.tsx`, `goHome`):
 *
 * - the header's back goes back when Home is behind, and replaces with Home
 *   when nothing is (the screen was opened from a push, a link, a reminder);
 * - Android's back at such a root goes Home instead of leaving the app. With
 *   history, the stack's own back runs.
 */
import { useCallback, useEffect } from "react";
import { BackHandler } from "react-native";
import { router } from "expo-router";

export function useBackToHome(): () => void {
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (router.canGoBack()) return false;
      router.replace("/home");
      return true;
    });
    return () => sub.remove();
  }, []);
  return useCallback(() => (router.canGoBack() ? router.back() : router.replace("/home")), []);
}
