/**
 * A screen can take a page colour that fills the whole screen, under the
 * status bar too (the note in Keep's style: its colour is the page).
 */
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Screen } from "../ScreenContainer";

it("paints the whole screen with the given background", () => {
  render(
    <Screen background="#123456">
      <Text testID="child">x</Text>
    </Screen>,
  );
  const root = screen.getByTestId("screen-root");
  expect(root).toHaveStyle({ backgroundColor: "#123456" });
});

it("defaults to the theme's ground", () => {
  render(
    <Screen>
      <Text>x</Text>
    </Screen>,
  );
  expect(screen.getByTestId("screen-root").props.style.backgroundColor).toBeTruthy();
});
