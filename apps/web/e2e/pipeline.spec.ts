import { expect, test } from "@playwright/test";

test("create a pipeline, add a deal, move it to Won, and see it on the dashboards", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Priya Sharma");
  await page.getByLabel("Work email").fill(`e2e-pipe-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`);
  await page.getByLabel("Password").fill("a long enough password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Agency name").fill("Madvertise");
  await page.getByRole("button", { name: "Create agency" }).click();
  await page.getByLabel("Client name").fill("Sunrise Dental");
  await page.getByRole("button", { name: "Add client account" }).click();
  await expect(page.getByRole("heading", { name: "Sunrise Dental" })).toBeVisible();

  // No pipeline yet: one button creates it with the standard stages.
  await page.getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.getByRole("button", { name: "Create sales pipeline" }).click();
  for (const stage of ["New lead", "Contacted", "Qualified", "Proposal sent", "Won", "Lost"]) {
    await expect(page.getByRole("region", { name: stage, exact: true })).toBeVisible();
  }

  // A deal is entered in rupees and starts in the first stage.
  await page.getByRole("button", { name: "New deal" }).click();
  await page.getByRole("button", { name: "Add deal" }).click();
  await expect(page.getByText("Deal name is required")).toBeVisible();
  await page.getByLabel("Deal name").fill("Braces for Rahul");
  await page.getByLabel("Value (₹)").fill("85000");
  await page.getByRole("button", { name: "Add deal" }).click();
  const newLead = page.getByRole("region", { name: "New lead", exact: true });
  await expect(newLead).toContainText("Braces for Rahul");
  await expect(newLead).toContainText("₹85,000");

  // Move it without dragging, as a keyboard user would.
  await page.getByLabel("Stage for Braces for Rahul").selectOption({ label: "Won" });
  const won = page.getByRole("region", { name: "Won", exact: true });
  await expect(won).toContainText("Braces for Rahul");
  await expect(newLead).not.toContainText("Braces for Rahul");

  // Drag a second deal across the board with the mouse.
  await page.getByRole("button", { name: "New deal" }).click();
  await page.getByLabel("Deal name").fill("Whitening");
  await page.getByLabel("Value (₹)").fill("12000");
  await page.getByRole("button", { name: "Add deal" }).click();
  await expect(newLead).toContainText("Whitening");
  const handle = await page.getByRole("button", { name: "Drag Whitening" }).boundingBox();
  const target = await page.getByRole("region", { name: "Contacted", exact: true }).boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + 120, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole("region", { name: "Contacted", exact: true })).toContainText("Whitening");

  // The client dashboard and the agency home both show the numbers.
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByText("1 won · 0 lost")).toBeVisible();
  await expect(page.getByText("1 open deal", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Latest deals" })).toContainText("Braces for Rahul");
  await page.getByRole("link", { name: "All clients" }).click();
  await expect(page.getByRole("link", { name: /Sunrise Dental/ })).toContainText("₹12,000");
});
