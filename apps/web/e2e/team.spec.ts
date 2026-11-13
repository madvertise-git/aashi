import { expect, test } from "@playwright/test";

const password = "a long enough password";
const unique = (label: string) => `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

test("an admin invites a teammate, who signs up from the link and joins as a member", async ({ browser, page }) => {
  const teammate = unique("mate");

  // The owner sets up an agency and sends the invite.
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Priya Sharma");
  await page.getByLabel("Work email").fill(unique("owner"));
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Agency name").fill("Madvertise");
  await page.getByRole("button", { name: "Create agency" }).click();
  await page.getByRole("link", { name: "Team" }).click();
  await expect(page.getByRole("list", { name: "Members" }).getByRole("listitem")).toHaveCount(1);
  await page.getByLabel("Their email").fill(teammate);
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByRole("status")).toContainText(`Invite sent to ${teammate}`);
  await expect(page.getByRole("list", { name: "Open invites" })).toContainText(teammate);

  // The link itself only goes out by email, so a made-up link shows the refusal path.
  const other = await (await browser.newContext()).newPage();
  await other.goto(`/invites/accept?token=${"x".repeat(43)}`);
  await other.getByRole("link", { name: "Create an account" }).click();
  await other.getByLabel("Your name").fill("Arjun Mehta");
  await other.getByLabel("Work email").fill(teammate);
  await other.getByLabel("Password").fill(password);
  await other.getByRole("button", { name: "Create account" }).click();
  await other.getByRole("button", { name: "Accept invite" }).click();
  await expect(other.getByText("This invite link is not valid")).toBeVisible();

  // Cancelling removes the invite.
  await page.getByRole("button", { name: `Cancel invite for ${teammate}` }).click();
  await expect(page.getByText("No open invites.")).toBeVisible();
});
