import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  computeExpectedPaise,
  formatINR,
  isValidKeyId,
  isValidKeySecret,
  keyMode,
  rupeesToPaise,
} from "@/lib/billing/connect";
import { verifyPaymentSignature } from "@/lib/billing/signature-server";
import { expectedPaiseForBlock } from "@/lib/billing/payments-server";
import { displayAnswer, validateAnswers } from "@/lib/forms/answers";
import { formSchemaV1, validateLogicGraph } from "@/lib/forms/schema";
import type { Block } from "@/types/forms";

describe("provider keys", () => {
  it("detects test/live mode", () => {
    expect(keyMode("rzp_test_abc123")).toBe("test");
    expect(keyMode("rzp_live_xyz")).toBe("live");
    expect(keyMode("bogus")).toBeNull();
  });

  it("validates key shapes", () => {
    expect(isValidKeyId("rzp_test_1234567890")).toBe(true);
    expect(isValidKeyId("")).toBe(false);
    expect(isValidKeyId("has space")).toBe(false);
    expect(isValidKeySecret("a1b2c3d4e5f6g7h8")).toBe(true);
    expect(isValidKeySecret("short")).toBe(false);
    expect(isValidKeySecret("has space in it abcdefgh")).toBe(false);
  });
});

describe("money math", () => {
  it("converts rupees to paise", () => {
    expect(rupeesToPaise(99)).toBe(9900);
    expect(rupeesToPaise("19.99")).toBe(1999);
    expect(rupeesToPaise(0.5)).toBeNull();
    expect(rupeesToPaise("nonsense")).toBeNull();
  });

  it("formats INR", () => {
    expect(formatINR(125000)).toBe("₹1,250.00");
    expect(formatINR(100)).toBe("₹1.00");
  });

  it("computes fixed and linked amounts", () => {
    expect(computeExpectedPaise({ amountPaise: 5000 }, {})).toEqual({ ok: true, paise: 5000 });
    expect(computeExpectedPaise({ amountFrom: "q" }, { q: 19.99 })).toEqual({ ok: true, paise: 1999 });
    expect(computeExpectedPaise({ amountFrom: "q" }, {}).ok).toBe(false);
    expect(computeExpectedPaise({ amountFrom: "q" }, { q: 0.001 }).ok).toBe(false);
    expect(computeExpectedPaise({}, {}).ok).toBe(false);
  });
});

describe("checkout signature", () => {
  const secret = "test_secret_1234567890";
  const orderId = "order_ABC123";
  const paymentId = "pay_XYZ789";
  const signature = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

  it("accepts a real signature and rejects tampering", () => {
    expect(verifyPaymentSignature({ orderId, paymentId, signature, keySecret: secret })).toBe(true);
    expect(verifyPaymentSignature({ orderId, paymentId: "pay_OTHER", signature, keySecret: secret })).toBe(false);
    expect(verifyPaymentSignature({ orderId, paymentId, signature, keySecret: "wrong" })).toBe(false);
    expect(verifyPaymentSignature({ orderId: "", paymentId, signature, keySecret: secret })).toBe(false);
  });
});

const payBlock = {
  id: "q_pay",
  type: "payment",
  title: "Pay",
  required: true,
  amountPaise: 25000,
} as Block;

describe("payment answers", () => {
  const schema = { blocks: [payBlock], logic: [] as never[] };

  it("accepts well-shaped payment answers", () => {
    const res = validateAnswers(schema, {
      q_pay: { type: "payment", value: { payment_id: "pay_1", order_id: "order_1", amount_paise: 25000 } },
    });
    expect(res.ok).toBe(true);
  });

  it("rejects malformed payment payloads", () => {
    for (const value of [
      { payment_id: "", order_id: "order_1", amount_paise: 25000 },
      { payment_id: "pay_1", order_id: "nope", amount_paise: 25000 },
      { payment_id: "pay_1", order_id: "order_1", amount_paise: 50 },
      null,
    ]) {
      expect(validateAnswers(schema, { q_pay: { type: "payment", value } }).ok).toBe(false);
    }
  });

  it("displays the paid amount", () => {
    expect(
      displayAnswer(payBlock, { type: "payment", value: { payment_id: "p", order_id: "o", amount_paise: 25000 } }),
    ).toBe("₹250.00 paid");
  });
});

describe("payment schema", () => {
  it("shapes fixed payments and bounds paise", () => {
    const base = { id: "p", type: "payment", title: "Pay" };
    expect(formSchemaV1.safeParse({ schemaVersion: 1, title: "T", blocks: [{ ...base, amountPaise: 500 }], logic: [] }).success).toBe(true);
    expect(
      formSchemaV1.safeParse({ schemaVersion: 1, title: "T", blocks: [{ ...base, amountPaise: 50 }], logic: [] }).success,
    ).toBe(false);
  });

  it("requires exactly one amount source at publish", () => {
    const graph = (blocks: never[]) => validateLogicGraph({ schemaVersion: 1, title: "T", blocks, logic: [] });
    expect(graph([{ id: "p", type: "payment", title: "Pay", amountPaise: 500 }] as never)).toEqual([]);
    expect(graph([{ id: "p", type: "payment", title: "Pay" }] as never)).toEqual([expect.stringContaining("either")]);
    expect(graph([{ id: "p", type: "payment", title: "Pay", amountPaise: 500, amountFrom: "q" }] as never)).toEqual([
      expect.stringContaining("either"),
    ]);
  });

  it("validates linked amount questions", () => {
    const errors = validateLogicGraph({
      schemaVersion: 1,
      title: "T",
      blocks: [
        { id: "q_total", type: "number", title: "Total" },
        { id: "q_pay", type: "payment", title: "Pay", amountFrom: "q_total" },
        { id: "q_bad", type: "payment", title: "Bad", amountFrom: "ghost" },
        { id: "q_name", type: "short_text", title: "Name" },
        { id: "q_bad2", type: "payment", title: "Bad2", amountFrom: "q_name" },
      ],
      logic: [],
    });
    expect(errors).toEqual([expect.stringContaining("ghost"), expect.stringContaining("numeric")]);
  });

  it("resolves linked amounts from answers", () => {
    const blocks = [
      { id: "q_total", type: "number", title: "Total" },
      { id: "q_pay", type: "payment", title: "Pay", amountFrom: "q_total" },
    ] as Block[];
    const pay = blocks[1] as Block & { type: "payment" };
    expect(expectedPaiseForBlock(blocks, pay, { q_total: { type: "number", value: 42 } })).toBe(4200);
    expect(expectedPaiseForBlock(blocks, pay, {})).toBeNull();
  });
});
