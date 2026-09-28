import type { Metadata } from "next";
import { ShelfView } from "./ShelfView";

export const metadata: Metadata = { title: "Shelf" };

export default function ShelfPage() {
  return <ShelfView />;
}
