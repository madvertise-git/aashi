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

  // Create the agency.
  await expect(page.getByRole("heading", { name: "Set up your agency" })).toBeVisible();
  await page.getByLabel("Agency name").fill("Madvertise");
  await page.getByRole("button", { name: "Create agency" }).click();
  await expect(page.getByRole("heading", { name: "Madvertise" })).toBeVisible();
  await expect(page.getByText("No client accounts yet")).toBeVisible();

  // Add a client account and open it.
  await page.getByLabel("Client name").fill("Sunrise Dental");
  await page.getByRole("button", { name: "Add client account" }).click();
  await page.getByRole("link", { name: /Sunrise Dental/ }).click();
  await expect(page.getByRole("heading", { name: "Sunrise Dental" })).toBeVisible();
  await expect(page.getByLabel("Client account")).toHaveValue(/.+/);

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

  // Sign out, sign back in: the data is still there.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a long enough password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Madvertise" })).toBeVisible();
  await page.getByRole("link", { name: /Sunrise Dental/ }).click();
  await expect(page.getByRole("row", { name: /Rahul Verma/ })).toBeVisible();
});
