import { describe, expect, it } from "vitest";
import {
  confirmationEmail,
  renderResponderTemplate,
  resolveResponderRecipient,
} from "@/lib/email/resend";

const blocks = [
  { id: "q_name", type: "short_text" },
  { id: "q_email", type: "email" },
  { id: "q_alt", type: "email" },
];

describe("resolveResponderRecipient", () => {
  it("uses the preferred email question when answered", () => {
    const to = resolveResponderRecipient(
      blocks,
      {
        q_email: { type: "email", value: "a@b.com" },
        q_alt: { type: "email", value: "b@c.com" },
      },
      "q_alt",
    );
    expect(to).toBe("b@c.com");
  });

  it("falls back to the first answered email question", () => {
    const to = resolveResponderRecipient(blocks, {
      q_alt: { type: "email", value: "b@c.com" },
    });
    expect(to).toBe("b@c.com");
  });

  it("skips invalid addresses and non-email questions", () => {
    expect(
      resolveResponderRecipient(blocks, { q_email: { type: "email", value: "nope" } }),
    ).toBeNull();
    expect(
      resolveResponderRecipient(blocks, { q_name: { type: "short_text", value: "a@b.com" } }),
    ).toBeNull();
    expect(
      resolveResponderRecipient(blocks, { q_email: { type: "email", value: "a@b.com" } }, "q_name"),
    ).toBeNull();
    expect(resolveResponderRecipient(blocks, {})).toBeNull();
  });
});

describe("renderResponderTemplate", () => {
  it("replaces {{form_title}} case-insensitively", () => {
    expect(renderResponderTemplate("Hi {{form_title}}!", "Signup")).toBe("Hi Signup!");
    expect(renderResponderTemplate("{{ FORM_TITLE }} rocks", "Signup")).toBe("Signup rocks");
    expect(renderResponderTemplate("No tokens", "Signup")).toBe("No tokens");
  });
});

describe("confirmationEmail", () => {
  const rows = [{ question: "Name", answer: "Ada" }];

  it("builds a default subject and body with the answers", () => {
    const mail = confirmationEmail({ formTitle: "Signup", rows, productName: "Soyl" });
    expect(mail.subject).toContain("Signup");
    expect(mail.text).toContain("Ada");
    expect(mail.html).toContain("Ada");
    expect(mail.html).toContain("Response received");
  });

  it("renders custom subject/message templates and escapes HTML", () => {
    const mail = confirmationEmail({
      formTitle: "Signup",
      subject: "Thanks {{form_title}}!",
      message: "Hello <b>Ada</b>",
      rows,
      productName: "Soyl",
    });
    expect(mail.subject).toBe("Thanks Signup!");
    expect(mail.text).toContain("Hello <b>Ada</b>");
    expect(mail.html).toContain("Hello &lt;b&gt;Ada&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Ada</b>");
  });
});
