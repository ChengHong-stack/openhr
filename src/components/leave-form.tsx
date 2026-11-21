"use client";
import { useState } from "react";

type T = { id: string; name: string; available: number | null; requiresReason: boolean };

export function LeaveForm({ types, action }: { types: T[]; action: (fd: FormData) => Promise<void> }) {
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
      <div className="sm:col-span-2">
        <button className="btn-primary">Submit request</button>
        <span className="ml-3 text-xs text-slate-500">Weekends and public holidays aren&apos;t counted.</span>
      </div>
    </form>
  );
}
