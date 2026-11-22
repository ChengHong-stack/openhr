import { fmtMoney } from "@/lib/money";

type Leave = {
  id: string;
  certPath: string | null;
  claim: { id: string; amount: unknown; currency: string; receiptPath: string | null } | null;
};

/** MC and medical-claim links shown under a leave request (My leave and Leave approvals). */
export function MedicalDocs({ leave }: { leave: Leave }) {
  if (!leave.certPath && !leave.claim) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-normal">
      {leave.certPath && (
        <a className="text-brand-600 hover:underline" href={`/api/leave/${leave.id}/cert`} target="_blank">View MC</a>
      )}
      {leave.claim && (
        <span className="text-slate-600">
          Medical claim <strong className="tabular-nums">{fmtMoney(leave.claim.amount, leave.claim.currency)}</strong>
          {leave.claim.receiptPath && (
            <> · <a className="text-brand-600 hover:underline" href={`/api/receipts/${leave.claim.id}`} target="_blank">receipt</a></>
          )}
        </span>
      )}
    </div>
  );
}
