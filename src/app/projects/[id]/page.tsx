import { cookies as nextCookies } from "next/headers";
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
  const cookies = await nextCookies();
  const { edit } = await searchParams;

  return (
    <Project
      projectId={id}
      csrfToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
      editMode={edit === "true"}
    />
  );
}
