"use client";

import { notFound } from "next/navigation";
import { SectorDashboard } from "@/components/sector/SectorDashboard";
import { SECTOR_PAGES } from "@/lib/sectors";

export default function SectorPage({ params }: { params: { slug: string } }) {
  if (!SECTOR_PAGES.some((s) => s.slug === params.slug)) notFound();
  return <SectorDashboard slug={params.slug} />;
}
