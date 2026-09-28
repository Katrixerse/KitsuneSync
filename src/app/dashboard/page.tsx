import type { Metadata } from "next";
import { Dashboard } from "./Dashboard";

export const metadata: Metadata = { title: "ID" };

export default function DashboardPage() {
  return <Dashboard />;
}
