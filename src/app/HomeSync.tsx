"use client";

import Link from "next/link";
import { SyncForm } from "@/components/SyncForm";
import { useKitsune } from "@/lib/store";

export function HomeSync() {
  const { library } = useKitsune();
  return (
    <>
      {library && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
          <span className="font-mono text-xs text-mute">
            Signed in as <span className="text-ink">@{library.user.name}</span>
            {library.demo && " (demo)"}
          </span>
          <Link href="/dashboard" className="btn btn-ghost">
            Open my ID →
          </Link>
        </div>
      )}
      <SyncForm
        key={library?.user.name ?? "none"}
        redirectTo="/dashboard" defaultUser={library && !library.demo ? library.user.name : ""} />
    </>
  );
}
