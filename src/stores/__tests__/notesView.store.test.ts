/**
 * The notes list layout (owner, 2026-11-13): Keep's 2-column grid is the
 * default; the list is a secondary choice, kept per user on this phone.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNotesView } from "../notesView.store";

beforeEach(async () => {
  await AsyncStorage.clear();
  useNotesView.setState({ layout: "grid", userId: null });
});

it("starts on the grid", async () => {
  await useNotesView.getState().hydrate(1);
  expect(useNotesView.getState().layout).toBe("grid");
});

it("keeps the choice across a restart, per user", async () => {
  await useNotesView.getState().hydrate(1);
  useNotesView.getState().setLayout("list");
  useNotesView.setState({ layout: "grid", userId: null });
  await useNotesView.getState().hydrate(1);
  expect(useNotesView.getState().layout).toBe("list");
  await useNotesView.getState().hydrate(2);
  expect(useNotesView.getState().layout).toBe("grid");
});

it("ignores a stored value it does not know", async () => {
  await AsyncStorage.setItem("mm-notes-layout:1", "carousel");
  await useNotesView.getState().hydrate(1);
  expect(useNotesView.getState().layout).toBe("grid");
});
