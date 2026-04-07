import type { SearchParams } from "@/types/searchParams";
import Projects from "./projects";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { owner } = await searchParams;

  return <Projects owner={owner ?? null} />;
}
