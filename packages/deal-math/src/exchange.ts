/**
 * packages/deal-math/src/exchange.ts — 1031 exchange deadlines (INFORMATIONAL).
 *
 * IRC §1031(a)(3): the replacement property must be identified within 45 days
 * of transferring the relinquished property, and received by the EARLIER of
 * 180 days after the transfer or the due date (with extensions) of the
 * transferor's tax return for the year of the transfer. This computes calendar
 * dates only. It is not tax advice; a qualified intermediary and a CPA own the
 * real answer, and the result says so.
 *
 * Conservative by default: without `taxReturnDueDate`, the unextended
 * individual due date (April 15 of the following year) is assumed, because a
 * late-year transfer's 180th day falls after it and overstating the deadline is
 * the costly mistake. Pass the real (extended) due date to lift that.
 */

import { z } from "zod";
import { parseOrThrow, result, type DealMathResult } from "./core.js";

const IsoDate = z.string().date();

export const ExchangeInputs = z
  .object({
    /** Date the relinquished property transferred (closing), YYYY-MM-DD. */
    relinquishedCloseDate: IsoDate,
    /** Due date of the transferor's return for that year, with extensions, if known. */
    taxReturnDueDate: IsoDate.optional(),
  })
  .refine((i) => i.taxReturnDueDate === undefined || i.taxReturnDueDate >= i.relinquishedCloseDate, {
    message: "the return due date is before the transfer",
    path: ["taxReturnDueDate"],
  });
export type ExchangeInputs = z.infer<typeof ExchangeInputs>;

export interface ExchangeValue {
  identificationDeadline: string;
  exchangeDeadline: string;
  exchangeDeadlineBasis: "180-days" | "tax-return-due-date" | "assumed-unextended-return-due-date";
  informationalOnly: true;
  note: string;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function exchange1031Timeline(inputs: ExchangeInputs): DealMathResult<ExchangeValue, ExchangeInputs, Record<string, never>> {
  const i = parseOrThrow("exchange1031Timeline", ExchangeInputs, inputs);
  const day180 = addDays(i.relinquishedCloseDate, 180);
  const assumed = i.taxReturnDueDate === undefined;
  const returnDue = i.taxReturnDueDate ?? `${Number(i.relinquishedCloseDate.slice(0, 4)) + 1}-04-15`;
  const byReturn = returnDue < day180;
  const basis = !byReturn ? "180-days" : assumed ? "assumed-unextended-return-due-date" : "tax-return-due-date";
  return result(
    {
      identificationDeadline: addDays(i.relinquishedCloseDate, 45),
      exchangeDeadline: byReturn ? returnDue : day180,
      exchangeDeadlineBasis: basis,
      informationalOnly: true,
      note:
        "Informational only, not tax advice. Confirm deadlines with a qualified intermediary and a CPA." +
        (basis === "assumed-unextended-return-due-date"
          ? " No return due date was given, so the unextended April 15 date was assumed; filing an extension can move the deadline out to the 180th day."
          : ""),
    },
    i,
    {},
  );
}
