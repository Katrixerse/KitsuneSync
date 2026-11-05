import { describe, expect, it } from "vitest";
import { demoLibrary, demoShelf } from "@/lib/demo";
import { accountSwitchWarning } from "./SyncForm";

describe("accountSwitchWarning", () => {
  const library = { ...demoLibrary(), demo: undefined };
  const shelf = demoShelf(library);
  const count = Object.keys(shelf).length;

  it("asks before syncing another account over a shelf", () => {
    expect(accountSwitchWarning(library, shelf, "Someone")).toBe(
      `Your shelf has ${count} series synced from @${library.user.name}. Switch to @Someone and keep the shelf? (You can clear everything in Settings.)`,
    );
  });

  it.each([
    ["the same user, ignoring case", library, shelf, library.user.name.toUpperCase()],
    ["an empty shelf", library, {}, "Someone"],
    ["the demo library", { ...library, demo: true }, shelf, "Someone"],
    ["no library", null, shelf, "Someone"],
  ])("stays quiet for %s", (_, lib, shelfState, user) => {
    expect(accountSwitchWarning(lib, shelfState, user)).toBeNull();
  });
});
