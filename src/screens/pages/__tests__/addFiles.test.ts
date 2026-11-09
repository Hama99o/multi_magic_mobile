/**
 * A pick that goes wrong must SAY so. Measured 2026-11-07 on qa_phone: a video
 * the system could not read made the photo picker throw
 * ("launchImageLibraryAsync ... setDataSource failed"); nothing caught it, so
 * nothing was uploaded and nothing was said. And on the Pages home a refused
 * permission was ignored in silence (the folder screen explained it).
 */
import { Alert } from "react-native";

const mockLaunch = jest.fn();
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: (...a: unknown[]) => mockLaunch(...a),
  launchCameraAsync: (...a: unknown[]) => mockLaunch(...a),
  UIImagePickerPreferredAssetRepresentationMode: { Current: "current" },
  VideoExportPreset: { Passthrough: 0 },
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

/* eslint-disable import/first */
import { explainPick, pickMedia, takePhotoOrVideo } from "../addFiles";

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("a picker that throws", () => {
  it("photos: answers 'failed' instead of throwing", async () => {
    mockLaunch.mockRejectedValueOnce(new Error("setDataSource failed: status = 0x80000000"));
    await expect(pickMedia()).resolves.toEqual({ failed: true });
  });
  it("camera: the same", async () => {
    mockLaunch.mockRejectedValueOnce(new Error("camera unavailable"));
    await expect(takePhotoOrVideo()).resolves.toEqual({ failed: true });
  });
});

describe("explainPick", () => {
  const t = (key: string) => key;
  it("says why when the pick failed", () => {
    expect(explainPick({ failed: true }, t)).toBeNull();
    expect(Alert.alert).toHaveBeenCalledWith("pages.add.failedTitle", "pages.add.failedBody");
  });
  it("says why when access was refused", () => {
    expect(explainPick({ denied: true }, t)).toBeNull();
    expect(Alert.alert).toHaveBeenCalledWith("pages.add.deniedTitle", "pages.add.deniedBody");
  });
  it("cancelled or empty: nothing to say, nothing to add", () => {
    expect(explainPick(null, t)).toBeNull();
    expect(explainPick({ files: [] }, t)).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
  });
  it("files: hands them over", () => {
    const files = [{ uri: "file:///a.jpg", name: "a.jpg", mimeType: "image/jpeg", size: 1 }];
    expect(explainPick({ files }, t)).toBe(files);
  });
});
