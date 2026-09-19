/**
 * A dialog with a text field lifts itself above the keyboard on iOS.
 *
 * Android's `adjustResize` shrinks a Modal's window when the keyboard opens;
 * iOS does nothing of the kind. So a centred dialog on an iPhone SE, with its
 * field focused — and RenameDialog focuses on open — sits half under the
 * keyboard. `KeyboardAvoidingView` with "padding" is the iOS answer; on Android
 * it must stay OFF, or the window resizes AND pads and the dialog jumps.
 */
import { render, screen } from "@testing-library/react-native";
import { KeyboardAvoidingView, Platform } from "react-native";
import type { ReactElement } from "react";
import { RenameDialog } from "../RenameDialog";
import { InstructionsDialog } from "../SessionOptionsDialogs";

const DIALOGS: { name: string; field: string; element: () => ReactElement }[] = [
  {
    name: "rename",
    field: "rename-input",
    element: () => <RenameDialog visible initialTitle="Money" onCancel={jest.fn()} onSave={jest.fn()} />,
  },
  {
    name: "instructions",
    field: "instructions-input",
    element: () => <InstructionsDialog visible initial="" onCancel={jest.fn()} onSave={jest.fn()} />,
  },
];

describe.each(DIALOGS)("the $name dialog", ({ field, element }) => {
  it("pads for the keyboard on iOS", () => {
    expect(Platform.OS).toBe("ios");
    render(element());

    expect(screen.getByTestId(field)).toBeTruthy();
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe("padding");
  });

  it("leaves the window to Android, which resizes it itself", () => {
    const os = jest.replaceProperty(Platform, "OS", "android");
    try {
      render(element());

      expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBeUndefined();
    } finally {
      os.restore();
    }
  });
});
