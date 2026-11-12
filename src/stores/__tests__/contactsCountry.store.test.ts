import AsyncStorage from "@react-native-async-storage/async-storage";
import { useContactsCountry } from "../contactsCountry.store";

beforeEach(async () => {
  await AsyncStorage.clear();
  useContactsCountry.setState({ country: "FR", hydrated: false });
});

it("keeps the country chosen in Contacts across a restart", async () => {
  useContactsCountry.getState().setCountry("AF");
  useContactsCountry.setState({ country: "FR", hydrated: false });
  await useContactsCountry.getState().hydrate();
  expect(useContactsCountry.getState().country).toBe("AF");
});

it("keeps the device's region when nothing was chosen, and ignores a code it does not know", async () => {
  await AsyncStorage.setItem("mm-contacts-country", "ZZ");
  await useContactsCountry.getState().hydrate();
  expect(useContactsCountry.getState().country).toBe("FR");
});

it("lets a choice made while storage answers win", async () => {
  await AsyncStorage.setItem("mm-contacts-country", "DE");
  const pending = useContactsCountry.getState().hydrate();
  useContactsCountry.getState().setCountry("AF");
  await pending;
  expect(useContactsCountry.getState().country).toBe("AF");
});
