/**
 * Editor image upload (audit P0 #5): the web's route, POST /api/v1/images
 * with `file`, no note_id (an editor upload owned by the user); the answer is
 * { url }. Server limits (Api::V1::ImagesController): png/jpeg/gif/webp,
 * 10 MB. Invented values only.
 */
import MockAdapter from "axios-mock-adapter";
import { imagesApi, imageProblem, IMAGE_MAX_BYTES } from "../images";
import { http } from "../http";

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
});
afterEach(() => mock.restore());

it("goes up as multipart `file` on /api/v1/images and gives back the url", async () => {
  mock.onPost("/api/v1/images").reply(201, { url: "https://files.example.test/blobs/abc/kitten.jpg" });
  const url = await imagesApi.upload({ uri: "file:///tmp/kitten.jpg", name: "kitten.jpg", mimeType: "image/jpeg" });
  expect(url).toBe("https://files.example.test/blobs/abc/kitten.jpg");
  const req = mock.history.post[0];
  expect(req.headers?.["Content-Type"]).toBe("multipart/form-data");
  expect(req.data).toBeInstanceOf(FormData);
  expect([...(req.data as FormData).keys()]).toEqual(["file"]); // no note_id: an editor upload, as the web
});

it("an answer without a url is an error, never an image with no picture", async () => {
  mock.onPost("/api/v1/images").reply(201, {});
  await expect(imagesApi.upload({ uri: "file:///tmp/a.png", name: "a.png", mimeType: "image/png" })).rejects.toThrow();
});

it("refuses before uploading what the server refuses: type and size", () => {
  expect(imageProblem({ mimeType: "image/jpeg", fileSize: 1000 })).toBeNull();
  expect(imageProblem({ mimeType: "image/webp" })).toBeNull();
  expect(imageProblem({ mimeType: "image/heic", fileSize: 1000 })).toBe("type");
  expect(imageProblem({ mimeType: "image/svg+xml" })).toBe("type");
  expect(imageProblem({ mimeType: "image/png", fileSize: IMAGE_MAX_BYTES + 1 })).toBe("size");
  expect(IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024);
});
