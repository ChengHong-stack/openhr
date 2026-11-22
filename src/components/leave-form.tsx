"use client";
import { useState } from "react";

type T = { id: string; name: string; available: number | null; requiresReason: boolean; medical: boolean };

const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";
const FILE_CLASS =
  "block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700";

export function LeaveForm({
  types, action, currency, claimLimit,
}: {
  types: T[];
  action: (fd: FormData) => Promise<void>;
  currency: string;
  /** Per-claim cap for medical claims; undefined = no medical claim category, null = no cap. */
  claimLimit?: number | null;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [half, setHalf] = useState("NONE");
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const t = types.find((x) => x.id === typeId);
  const single = !end || end === start;

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="leaveTypeId">Leave type</label>
        <select id="leaveTypeId" name="leaveTypeId" className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {types.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}{x.available !== null ? ` — ${x.available} day(s) left` : " — unpaid"}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="startDate">From</label>
        <input id="startDate" name="startDate" type="date" required className="input" value={start}
          onChange={(e) => { setStart(e.target.value); if (!end || e.target.value > end) setEnd(e.target.value); }} />
      </div>
      <div>
        <label className="label" htmlFor="endDate">To</label>
        <input id="endDate" name="endDate" type="date" required className="input" value={end} min={start}
          onChange={(e) => { setEnd(e.target.value); if (e.target.value !== start) setHalf("NONE"); }} />
      </div>
      <div className="sm:col-span-2">
        <span className="label">Duration</span>
        <div className="flex flex-wrap gap-2 text-sm">
          {[["NONE", "Full day(s)"], ["AM", "Half day — morning"], ["PM", "Half day — afternoon"]].map(([v, l]) => (
            <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 ${half === v ? "border-brand-500 bg-brand-50" : "border-slate-300"} ${v !== "NONE" && !single ? "opacity-40" : ""}`}>
              <input type="radio" name="halfDay" value={v} checked={half === v} disabled={v !== "NONE" && !single} onChange={() => setHalf(v)} />
              {l}
            </label>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="reason">Reason {t?.requiresReason ? "(required)" : "(optional)"}</label>
        <textarea id="reason" name="reason" rows={2} className="input" required={t?.requiresReason} maxLength={1000} />
      </div>
      {t?.medical && (
        <fieldset key={t.id} className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium text-slate-700">Medical documents</legend>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="medicalCert">Medical certificate (MC) · JPG, PNG, PDF · max 8 MB</label>
            <input id="medicalCert" name="medicalCert" type="file" accept={FILE_ACCEPT} capture="environment" className={FILE_CLASS} />
          </div>
          {claimLimit !== undefined && (
            <>
              <p className="text-xs text-slate-500 sm:col-span-2">
                Paid for the clinic visit? Claim it here and it&apos;s approved together with this leave.
                {claimLimit !== null && ` Max ${currency} ${claimLimit.toFixed(2)}.`}
              </p>
              <div>
                <label className="label" htmlFor="claimAmount">Medical claim ({currency}, optional)</label>
                <input id="claimAmount" name="claimAmount" type="number" step="0.01" min="0.01" max={claimLimit ?? undefined} inputMode="decimal" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="claimReceipt">Clinic receipt</label>
                <input id="claimReceipt" name="claimReceipt" type="file" accept={FILE_ACCEPT} capture="environment" className={FILE_CLASS} />
              </div>
            </>
          )}
        </fieldset>
      )}
      <div className="sm:col-span-2">
        <button className="btn-primary">Submit request</button>
        <span className="ml-3 text-xs text-slate-500">Weekends and public holidays aren&apos;t counted.</span>
      </div>
    </form>
  );
}
