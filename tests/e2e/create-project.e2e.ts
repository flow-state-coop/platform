import { test, expect } from "@playwright/test";
import { installMockWallet } from "./helpers/setup";
import { enterAuthenticated } from "./helpers/signIn";

test.beforeEach(async ({ page }) => {
  await installMockWallet(page);
});

test("authenticated user can open the Create Project modal", async ({
  page,
}) => {
  await enterAuthenticated(page, "/projects");

  // Sanity check: the SIWE bootstrap must have produced a session before we
  // click the gated Create Project card, otherwise handleCreateClick falls
  // back to the openConnectModal / handleSignIn branches.
  const sessionRes = await page.request.get("/api/auth/session");
  const session = await sessionRes.json();
  expect(session?.address).toBeTruthy();

  // Click the card's "add" icon — the onClick lives on the Card wrapper, and
  // clicking the inner paragraph sometimes misses the handler.
  await page.getByAltText("add").click();

  // ProjectModal renders as a react-bootstrap Modal (role=dialog) with the
  // "Project Name*" form label inside. Bootstrap's Form.Label has no
  // auto-wired htmlFor here, so getByLabel doesn't find it — match the
  // visible label text inside the dialog instead.
  await expect(
    page.getByRole("dialog").getByText(/project name/i),
  ).toBeVisible({ timeout: 10_000 });
});
