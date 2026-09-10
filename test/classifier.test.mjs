import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/recognize/classifier.js";

test("classify: below min_samples → insufficient_data", async () => {
  const r = await classify(null, {}, { meta: { n_samples: 12, min_samples: 50, classes: [] } });
  assert.equal(r.status, "insufficient_data");
  assert.equal(r.have, 12);
  assert.equal(r.need, 50);
  assert.deepEqual(r.predictions, []);
});

test("classify: no meta at all → unavailable", async () => {
  const r = await classify(null, {}, { meta: null });
  assert.equal(r.status, "unavailable");
});
