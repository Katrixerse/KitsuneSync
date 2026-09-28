import type { Metadata } from "next";
import { Lists } from "./Lists";

export const metadata: Metadata = { title: "Lists" };

export default function ListsPage() {
  return <Lists />;
}
