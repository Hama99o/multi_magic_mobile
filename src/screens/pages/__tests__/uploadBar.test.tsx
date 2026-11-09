/**
 * The upload bar tells the truth (QA_FULL U3, U4). Measured 2026-11-07: a
 * 107 MB clip read "Uploading · 0 %" for ~19 s and then 99 %. A bar that sits
 * at 0 % reads as broken; while no byte count is known it says "Uploading…",
 * and while files are being copied in, "Preparing…".
 */
import { render, screen } from "@testing-library/react-native";
import type { UploadItem } from "@/stores/uploads.store";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

/* eslint-disable import/first */
import { UploadBar } from "../drive/ui";
import { useUploads } from "@/stores/uploads.store";

const row = (over: Partial<UploadItem>): UploadItem => ({
  id: "1", localUri: "file:///a", fileName: "a.mov", mimeType: "video/quicktime", size: 100, destination: { spaceId: 1, parentId: null, label: "QA" },
  status: "uploading", sent: 0, error: null, attempts: 0, queuedAt: "2026-11-07T10:00:00Z", ...over,
});

it("while files are copied in: Preparing…", () => {
  useUploads.setState({ items: [row({ status: "preparing" })] });
  render(<UploadBar />);
  expect(screen.getByText("Preparing…")).toBeTruthy();
});

it("sending with no byte count yet: Uploading…, not 0 %", () => {
  useUploads.setState({ items: [row({ status: "uploading", sent: 0 })] });
  render(<UploadBar />);
  expect(screen.getByText("Uploading…")).toBeTruthy();
  expect(screen.queryByText(/0 ?%/)).toBeNull();
});

it("once bytes are known: the percentage", () => {
  useUploads.setState({ items: [row({ status: "uploading", sent: 42 })] });
  render(<UploadBar />);
  expect(screen.getByText("Uploading · 42%")).toBeTruthy();
});
