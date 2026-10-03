import type { Metadata } from "next";
import { PageView, pageMetadata } from "@/components/page-view";

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("");
}

export default function HomePage() {
  return <PageView slug="" />;
}
