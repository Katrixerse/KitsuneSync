import type { Metadata } from "next";
import { Wishlist } from "./Wishlist";

export const metadata: Metadata = { title: "Wishlist" };

export default function WishlistPage() {
  return <Wishlist />;
}
