import test from "node:test";
import assert from "node:assert/strict";
import { openAsBlob } from "node:fs";
import { extractEmbedded, chooseTracks } from "../js/embedded.js";

const dir = new URL("./fixtures/", import.meta.url);
const expected = ["Hello there, how are you doing?", "I'm fine, thanks. Where were you last night?", "We need to leave the city tonight.", "I can't believe it's already over."];

for (const f of ["sample-srt.mkv", "sample-ass.mkv", "sample.mp4", "sample.webm"]) {
  test(`trích phụ đề nhúng trong ${f}`, async () => {
    const tracks = await extractEmbedded(await openAsBlob(new URL(f, dir)));
    assert.equal(tracks.length, 1);
    const { en } = chooseTracks(tracks);
    assert.deepEqual(en.cues.map((c) => c.text), expected);
    assert.deepEqual(en.cues.map((c) => [c.start, c.end]), [[0.5, 2], [2.5, 4.8], [5, 7.5], [8, 9.8]]);
    assert.equal(en.cues[3].vi, "Tôi không tin là đã kết thúc rồi.");
  });
}

test("file không phải video trả về null", async () => {
  assert.equal(await extractEmbedded(new Blob(["1\n00:00:01,000 --> 00:00:02,000\nhi"])), null);
});
