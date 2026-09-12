# Unclassified covers

The list of photos with no reliable location yet lives in
[`data/unclassified.json`](../unclassified.json) — that file is what the
site's **"❓ Help classify"** tool (`?tool=unclassify`) actually loads, so
it's the source of truth; this doc is just a pointer so it's easy to find
from a repo browse.

Images: `assets/photos/_unclassified/<slug>.webp` + `.thumb.webp` (EXIF
already stripped before they ever reached this repo).

Anyone can open the live site, click **"❓ Help classify"**, and if they
recognise one of these covers, fill in its name/prefecture/coordinates —
the tool generates the same JSON block the normal contribution form does,
plus instructions to move the photo out of `_unclassified/`. See
`src/contribute/unclassify.js` for the implementation.
