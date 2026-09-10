import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, randHex } from "../src/contribute/image.js";

test("slugify: ascii", () => {
  assert.equal(slugify("This Number & Co!"), "this-number-co");
  assert.equal(slugify("  multiple   spaces  "), "multiple-spaces");
  assert.equal(slugify("--already--kebab--"), "already-kebab");
});

test("slugify: empty / non-ascii falls back", () => {
  assert.equal(slugify(""), "cover");
  assert.equal(slugify("京都市"), "cover");
});

test("randHex: length and charset", () => {
  const h = randHex(4);
  assert.match(h, /^[0-9a-f]{4}$/);
  assert.notEqual(randHex(8), randHex(8));
});
