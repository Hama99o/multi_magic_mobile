/**
 * The image a phone inserts is the node the web writes when an upload ends
 * (tiptop ImageUploaderExtension: uploading false, failed false, src, progress
 * 100; selectMedia false after a pick), so the web shows it as its own.
 */
import { imageNode } from "../editor/imageNode";
import { fromHTML, toHTML } from "@/vendor/tiptop-schema";
import { toEngine, fromEngine } from "../editor/engineGlue";

it("is the web's finished imageUploader", () => {
  const n = imageNode({ url: "https://files.example.test/k.jpg", name: "k.jpg", size: 2048, id: "img-1" });
  expect(n).toEqual({
    type: "imageUploader",
    attrs: { id: "img-1", src: "https://files.example.test/k.jpg", progress: 100, failed: false, uploading: false, selectMedia: false, errorMessage: null, name: "k.jpg", size: 2048 },
  });
});

it("serializes to the web's image-uploader div, reads back, and survives the engine round trip", () => {
  const n = imageNode({ url: "https://files.example.test/k.jpg", name: "k.jpg", id: "img-2" });
  const doc = { type: "doc", content: [n, { type: "paragraph" }] };
  expect(fromEngine(toEngine(doc as never))).toEqual(doc);
  const html = toHTML(doc as never);
  expect(html).toContain('data-type="image-uploader"');
  expect(html).toContain('src="https://files.example.test/k.jpg"');
  expect(html).toContain('data-uploading="false"');
  const back = fromHTML(html) as { content: { type: string; attrs?: Record<string, unknown> }[] };
  expect(back.content[0].type).toBe("imageUploader");
  expect(back.content[0].attrs?.src).toBe("https://files.example.test/k.jpg");
});

it("gives each image its own id when none is passed", () => {
  const a = imageNode({ url: "u" }).attrs!.id;
  const b = imageNode({ url: "u" }).attrs!.id;
  expect(typeof a).toBe("string");
  expect(a).not.toBe(b);
});
