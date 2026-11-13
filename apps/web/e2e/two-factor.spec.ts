import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

/** The code an authenticator app would show right now for this set-up key. */
function totpCode(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0xf;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

test("switch on two-factor sign-in, then sign in with a code", async ({ page }) => {
  const email = `e2e-2fa-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const password = "a long enough password";

  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Meera Iyer");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Set up your agency" })).toBeVisible();

  // Set up: password, then the key and backup codes, then a code to confirm.
  await page.getByRole("link", { name: "Security" }).click();
  await expect(page.getByText(/^Off\./)).toBeVisible();
  await page.getByLabel("Your password").fill(password);
  await page.getByRole("button", { name: "Set up" }).click();
  const secret = (await page.locator("code").innerText()).trim();
  await expect(page.getByRole("list", { name: "Backup codes" }).getByRole("listitem")).toHaveCount(10);
  await page.getByLabel("Code from the app").fill(totpCode(secret));
  await page.getByRole("button", { name: "Switch on two-factor sign-in" }).click();
  await expect(page.getByText(/^On\./)).toBeVisible();

  // Signing in now takes two steps; a wrong code is refused.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That code is not right")).toBeVisible();
  await page.getByLabel("Code").fill(totpCode(secret));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Set up your agency" })).toBeVisible();
});
