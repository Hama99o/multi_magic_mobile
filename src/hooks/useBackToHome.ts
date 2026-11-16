/**
 * Back to the app grid, the way Notes does it (app/notes/index.tsx): with
 * Home behind, pop to it; opened with nothing behind (a link, a
 * notification, a cold start on the app), replace with Home. And Android's
 * back at that root goes Home instead of out of the app; with history, the
 * stack's own back runs. Audit 2026-11-16, the owner's known issue.
 */
import { useEffect } from "react";
import { BackHandler } from "react-native";
import { router } from "expo-router";

export function goHome(): void {
  if (router.canGoBack()) router.back();
  else router.replace("/home");
}

/** Android's back at an app's root with nothing behind goes Home. */
export function useAndroidBackToHome(): void {
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (router.canGoBack()) return false;
      router.replace("/home");
      return true;
    });
    return () => sub.remove();
  }, []);
}

/** Both at once: Android's back goes Home at the root, and the header's back to call. */
export function useBackToHome(): () => void {
  useAndroidBackToHome();
  return goHome;
}
