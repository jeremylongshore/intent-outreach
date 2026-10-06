/**
 * packages/deal-math/src/exchange.ts — 1031 exchange deadlines (INFORMATIONAL).
 *
 * IRC §1031(a)(3): the replacement property must be identified within 45 days
 * of transferring the relinquished property, and received by the EARLIER of
 * 180 days after the transfer or the due date (with extensions) of the
 * transferor's tax return for the year of the transfer. This computes calendar
 * dates only. It is not tax advice; a qualified intermediary and a CPA own the
 * real answer, and the result says so.
 */

import { z } from "zod";
import { parseOrThrow, result, type DealMathResult } from "./core.js";

const IsoDate = z.string().date();

export const ExchangeInputs = z.object({
  /** Date the relinquished property transferred (closing), YYYY-MM-DD. */
  relinquishedCloseDate: IsoDate,
  /** Due date of the transferor's return for that year, with extensions, if known. */
  taxReturnDueDate: IsoDate.optional(),
});
export type ExchangeInputs = z.infer<typeof ExchangeInputs>;

export interface ExchangeValue {
  identificationDeadline: string;
  exchangeDeadline: string;
  exchangeDeadlineBasis: "180-days" | "tax-return-due-date";
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
  const byReturn = i.taxReturnDueDate !== undefined && i.taxReturnDueDate < day180;
  return result(
    {
      identificationDeadline: addDays(i.relinquishedCloseDate, 45),
      exchangeDeadline: byReturn ? (i.taxReturnDueDate as string) : day180,
      exchangeDeadlineBasis: byReturn ? "tax-return-due-date" : "180-days",
      informationalOnly: true,
      note: "Informational only, not tax advice. Confirm deadlines with a qualified intermediary and a CPA.",
    },
    i,
    {},
  );
}
