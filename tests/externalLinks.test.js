import test from "node:test";
import assert from "node:assert/strict";
import { classifyExternalLinks, sanitizeExternalHref } from "../web/lib/externalLinks.js";

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

test("classifyExternalLinks keeps available links and surfaces missing entries", () => {
  const result = classifyExternalLinks([
    {
      label: "Live Service",
      href: "https://world.metavie.co/services/elo-agent-web-plugin",
      missingMessage: "Live service publishes after the operating endpoint is available."
    },
    {
      label: "Source Repo",
      href: "javascript:alert(1)",
      missingMessage: "Source repo publishes after the source surface is connected."
    }
  ]);

  assert.deepEqual(result.availableLinks, [
    {
      label: "Live Service",
      href: "https://world.metavie.co/services/elo-agent-web-plugin",
      missingMessage: "Live service publishes after the operating endpoint is available."
    }
  ]);
  assert.deepEqual(result.missingLinks, [
    {
      label: "Source Repo",
      href: "",
      missingMessage: "Source repo publishes after the source surface is connected."
    }
  ]);
});
