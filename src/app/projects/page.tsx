import { cookies as nextCookies } from "next/headers";
import type { SearchParams } from "@/types/searchParams";
import Projects from "./projects";

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const cookies = await nextCookies();

  return (
    <Projects
      csrfToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
      owner={searchParams.owner ?? null}
    />
  );
}
