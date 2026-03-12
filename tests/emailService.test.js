import test from "node:test";
import assert from "node:assert/strict";
import { EmailService } from "../src/services/emailService.js";

test("email service should prefer brevo api when api key is configured", () => {
  const service = new EmailService({
    brevoApiKey: "test-key",
    brevoSenderName: "MetaVie",
    brevoSenderEmail: "noreply@metavie.co"
  });

  assert.equal(service.enabled, true);
  assert.equal(service.mode, "brevo-api");
});

test("email service should fall back to smtp when api key is absent", () => {
  const service = new EmailService({
    host: "smtp.example.com",
    port: 587,
    user: "user@example.com",
    pass: "secret",
    from: "noreply@example.com"
  });

  assert.equal(service.enabled, true);
  assert.equal(service.mode, "smtp");
});
