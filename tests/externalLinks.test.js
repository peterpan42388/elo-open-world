import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeExternalHref } from "../web/lib/externalLinks.js";

test("sanitizeExternalHref keeps absolute http and https links", () => {
  assert.equal(
    sanitizeExternalHref(" https://world.metavie.co/services/elo-agent-onboarder "),
    "https://world.metavie.co/services/elo-agent-onboarder"
  );
  assert.equal(
    sanitizeExternalHref("http://127.0.0.1:8788"),
    "http://127.0.0.1:8788/"
  );
});

test("sanitizeExternalHref rejects non-http protocols and relative paths", () => {
  assert.equal(sanitizeExternalHref("javascript:alert(1)"), "");
  assert.equal(sanitizeExternalHref("data:text/html,hello"), "");
  assert.equal(sanitizeExternalHref("/local/path"), "");
  assert.equal(sanitizeExternalHref("not a url"), "");
});
