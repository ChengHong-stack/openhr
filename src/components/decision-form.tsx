type Action = (fd: FormData) => Promise<void>;

/** Approve / reject buttons with an optional note. Each button posts to its own server action. */
export function DecisionForm({ id, approve, reject, returnTo }: { id: string; approve: Action; reject: Action; returnTo: string }) {
  return (
    <form action={approve} className="flex min-w-56 flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input name="note" className="input !py-1.5" placeholder="Note (required to reject)" maxLength={500} />
      <div className="flex gap-2">
        <button formAction={approve} data-decision="approve" className="btn-success flex-1 !py-1.5">Approve</button>
        <button formAction={reject} data-decision="reject" className="btn-danger flex-1 !py-1.5">Reject</button>
      </div>
    </form>
  );
}
