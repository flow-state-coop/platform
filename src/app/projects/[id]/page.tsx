import type { SearchParams } from "@/types/searchParams";
import Project from "./project";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;

  return <Project projectId={id} editMode={edit === "true"} />;
}
