"use client";

import type { ReactNode } from "react";
import { useKitsune, type KitsuneState } from "@/lib/store";
import type { Library } from "@/lib/anilist/types";
import { CatMascot } from "./CatMascot";
import { SyncForm } from "./SyncForm";

/** Renders children only once a library is synced; otherwise asks for a username. */
export function RequireLibrary({
  children,
}: {
  children: (state: KitsuneState & { library: Library }) => ReactNode;
}) {
  const state = useKitsune();

  if (!state.library) {
    return (
      <div className="panel mx-auto flex max-w-xl flex-col items-center gap-4 p-8 text-center">
        <CatMascot mood="sleepy" className="h-28 w-28" />
        <h1 className="font-display text-2xl font-bold">No data jacked in yet</h1>
        <p className="text-sm text-mute">Sync an AniList profile or load the demo to get started.</p>
        <SyncForm />
      </div>
    );
  }

  return <>{children({ ...state, library: state.library })}</>;
}
