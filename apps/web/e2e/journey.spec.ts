import { expect, test } from "@playwright/test";

test("sign up, create an agency, add a client account, add a contact", async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const phone = `9${Math.floor(Math.random() * 1e9).toString().padStart(9, "0")}`;

  // A visitor who is not signed in is sent to the sign-in page.
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByRole("link", { name: "Create an account" }).click();

  // Sign up. Bad input is caught on the screen before anything is sent.
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Name is required")).toBeVisible();
  await page.getByLabel("Your name").fill("Priya Sharma");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("a long enough password");
  await page.getByRole("button", { name: "Create account" }).click();

  // Onboarding: name the agency, then add the first client and land on its dashboard.
  await expect(page.getByRole("heading", { name: "Set up your agency" })).toBeVisible();
  await page.getByLabel("Agency name").fill("Madvertise");
  await page.getByRole("button", { name: "Create agency" }).click();
  await expect(page.getByRole("heading", { name: "Add your first client" })).toBeVisible();
  await page.getByLabel("Client name").fill("Sunrise Dental");
  await page.getByRole("button", { name: "Add client account" }).click();
  await expect(page.getByRole("heading", { name: "Sunrise Dental" })).toBeVisible();
  await expect(page.getByLabel("Client account")).toHaveValue(/.+/);
  // A new client starts with a checklist and nothing counted yet.
  await expect(page.getByText("0 of 3 done")).toBeVisible();
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page.getByText("No contacts yet")).toBeVisible();

  // Add a contact. A bare Indian mobile number is shown in international format.
  await page.getByLabel("First name").fill("Rahul");
  await page.getByLabel("Last name").fill("Verma");
  await page.getByLabel("Phone").fill(phone);
  await page.getByRole("button", { name: "Add contact" }).click();
  const row = page.getByRole("row", { name: /Rahul Verma/ });
  await expect(row).toContainText(`+91${phone}`);

  // The same phone number again is refused, with the reason next to the field.
  await page.getByLabel("First name").fill("Duplicate");
  await page.getByLabel("Phone").fill(phone);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText("A contact with this phone number already exists here.")).toBeVisible();

  // The dashboard now counts the contact and ticks the first step.
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByText("1 of 3 done")).toBeVisible();
  await expect(page.getByRole("list", { name: "Latest contacts" })).toContainText("Rahul Verma");

  // Sign out, sign back in: the agency's home lists the client with its numbers.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a long enough password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Madvertise" })).toBeVisible();
  const card = page.getByRole("link", { name: /Sunrise Dental/ });
  await expect(card).toContainText("Contacts1");
  await card.click();
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page.getByRole("row", { name: /Rahul Verma/ })).toBeVisible();
});
