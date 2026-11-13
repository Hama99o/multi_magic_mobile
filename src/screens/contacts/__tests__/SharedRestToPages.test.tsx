/**
 * The banner after a share that mixed contact cards with other files
 * (contacts SPEC §F.3): it says how many were not contacts and offers them
 * to Pages; with nothing waiting it is not there.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router as mockedRouter } from "expo-router";
import i18n from "@/i18n";
import { usePendingImport } from "@/screens/pages/addFiles";
import { SharedRestToPages } from "../SharedRestToPages";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
const router = mockedRouter as unknown as { push: jest.Mock };
const photo = { uri: "file:///p.jpg", name: "p.jpg", mimeType: "image/jpeg", size: 10 };

beforeEach(async () => {
  await i18n.changeLanguage("en");
  router.push.mockClear();
  usePendingImport.getState().clear();
});

it("says how many files were not contacts, and Save to Pages opens Pages with them", () => {
  usePendingImport.getState().set([photo, { ...photo, name: "v.mp4" }]);
  render(<SharedRestToPages rest="2" />);
  expect(screen.getByText("2 other files from that share are not contacts.")).toBeTruthy();
  fireEvent.press(screen.getByTestId("contacts-shared-rest-save"));
  expect(router.push).toHaveBeenCalledWith("/pages/save");
});

it("one file: the singular", () => {
  usePendingImport.getState().set([photo]);
  render(<SharedRestToPages rest="1" />);
  expect(screen.getByText("1 other file from that share is not a contact.")).toBeTruthy();
});

it("nothing left waiting (already saved, or no rest at all): no banner", () => {
  render(<SharedRestToPages rest="2" />);
  expect(screen.queryByTestId("contacts-shared-rest")).toBeNull();
  usePendingImport.getState().set([photo]);
  render(<SharedRestToPages rest={undefined} />);
  expect(screen.queryByTestId("contacts-shared-rest")).toBeNull();
});

it("French", async () => {
  await i18n.changeLanguage("fr");
  usePendingImport.getState().set([photo, photo]);
  render(<SharedRestToPages rest="2" />);
  expect(screen.getByText("2 autres fichiers de ce partage ne sont pas des contacts.")).toBeTruthy();
  expect(screen.getByText("Enregistrer dans Pages")).toBeTruthy();
});
