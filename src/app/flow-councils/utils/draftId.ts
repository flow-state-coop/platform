// Client-generated id used as the URL segment for a not-yet-saved application,
// replacing the old non-fetchable "new" sentinel. It also namespaces the
// application's localStorage draft, so two in-progress drafts never collide.
export function generateDraftId() {
  return `draft_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
