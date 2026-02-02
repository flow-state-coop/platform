import { cookies as nextCookies } from "next/headers";
import type { SearchParams } from "@/types/searchParams";
import Projects from "./projects";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const cookies = await nextCookies();
  const { owner } = await searchParams;

  return (
    <Projects
      csrfToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
      owner={owner ?? null}
    />
  );
}
