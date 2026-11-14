import { expect, test } from "@playwright/test";

test("a contact gets a company, a custom field, a tag and a note", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  const phone = `9${Math.floor(Math.random() * 1e9).toString().padStart(9, "0")}`;

  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Priya Sharma");
  await page.getByLabel("Work email").fill(`e2e-crm-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`);
  await page.getByLabel("Password").fill("a long enough password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Agency name").fill("Madvertise");
  await page.getByRole("button", { name: "Create agency" }).click();
  await page.getByLabel("Client name").fill("Sunrise Dental");
  await page.getByRole("button", { name: "Add client account" }).click();
  await page.getByRole("link", { name: /Sunrise Dental/ }).click();

  // A company and a custom field for this client account.
  await page.getByRole("link", { name: "Companies" }).click();
  await page.getByLabel("Company name").fill("Lotus Clinics");
  await page.getByLabel("Website").fill("not a web address");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(page.getByText("Enter a full web address")).toBeVisible();
  await page.getByLabel("Website").fill("https://lotus.example.test");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(page.getByRole("list", { name: "Companies" })).toContainText("Lotus Clinics");
  await page.getByRole("link", { name: "← Contacts" }).click();

  await page.getByRole("link", { name: "Custom fields" }).click();
  await page.getByLabel("Field name").fill("Plan");
  await page.getByLabel("Kind of answer").selectOption("select");
  await page.getByLabel("Choices").fill("Basic, Premium");
  await page.getByRole("button", { name: "Add field" }).click();
  await expect(page.getByRole("list", { name: "Custom fields" })).toContainText("Plan · Contacts · Choice from a list: Basic, Premium");
  await page.getByRole("link", { name: "← Contacts" }).click();

  // A contact, then its own page.
  await page.getByLabel("First name").fill("Rahul");
  await page.getByLabel("Last name").fill("Verma");
  await page.getByLabel("Phone").fill(phone);
  await page.getByRole("button", { name: "Add contact" }).click();
  await page.getByRole("link", { name: "Rahul Verma" }).click();
  await expect(page.getByRole("heading", { name: "Rahul Verma" })).toBeVisible();

  await page.getByLabel("Company").selectOption({ label: "Lotus Clinics" });
  await page.getByLabel("Plan").selectOption("Premium");
  await page.getByLabel("Last name").fill("Verma-Rao");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Rahul Verma-Rao" })).toBeVisible();

  await page.getByLabel("Add a tag").fill("Hot lead");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("list", { name: "Tags" })).toContainText("Hot lead");

  await page.getByLabel("New note").fill("Called, wants the premium plan.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("list", { name: "Notes" })).toContainText("Called, wants the premium plan.");
  await expect(page.getByRole("list", { name: "Notes" })).toContainText("Priya Sharma");

  // Everything is still there after a reload, and shows on the list.
  await page.reload();
  await expect(page.getByLabel("Company")).toHaveValue(/.+/);
  await expect(page.getByLabel("Plan")).toHaveValue("Premium");
  await page.getByRole("link", { name: "← All contacts" }).click();
  await expect(page.getByRole("row", { name: /Rahul Verma-Rao/ })).toContainText("Hot lead");

  // Delete the contact.
  await page.getByRole("link", { name: "Rahul Verma-Rao" }).click();
  await page.getByRole("button", { name: "Delete contact" }).click();
  await expect(page.getByText("No contacts yet")).toBeVisible();
});
