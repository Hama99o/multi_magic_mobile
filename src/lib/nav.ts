/**
 * NAVIGATION THAT KNOWS WHICH PANE IT IS IN (docs/design/workspace/SPEC.md §C2, §C3).
 *
 * Screens move with `useNav()` and read their params with `useNavParams()`,
 * never with expo-router's `router` singleton or `useLocalSearchParams`
 * directly. The lint rule (`.eslintrc.js`, "pane-nav") holds that line, and
 * `scripts/codemods/paneNav.js` made the change mechanically (re-run it on a
 * branch that predates it rather than resolving conflicts by hand).
 *
 * Outside a Workspace pane, which is everywhere today, both are exactly
 * expo-router's: `useNav()` returns the `router` object itself and
 * `useNavParams()` returns `useLocalSearchParams()`, with the same types. So
 * nothing a person sees changes, no call site's type changes, and every test
 * that mocks `expo-router` keeps working as it was.
 *
 * Inside a pane (the Workspace, not built yet), a `PaneNavContext` provider
 * gives the pane's own stack. A singleton call there would move the WHOLE
 * app, not the pane, which is why the singleton has to go from the screens.
 */
import { createContext, useContext } from "react";
import { router, useLocalSearchParams } from "expo-router";

/** Everything a screen may do to its navigation: `router`'s own shape, so the codemod changes no types. */
export type Nav = typeof router;

export interface PaneNav {
  nav: Nav;
  params: Record<string, string | string[]>;
}

/** Set by a Workspace pane around the screen it shows; null everywhere else. */
export const PaneNavContext = createContext<PaneNav | null>(null);

export function useNav(): Nav {
  const pane = useContext(PaneNavContext);
  return pane ? pane.nav : router;
}

/** `useLocalSearchParams`, overloads and all, or the pane's params inside a pane. */
export const useNavParams = (() => {
  // Both hooks run on every render, in the same order, pane or not (the rules of hooks).
  const local = useLocalSearchParams();
  const pane = useContext(PaneNavContext);
  return pane ? pane.params : local;
}) as typeof useLocalSearchParams;
