const { test, expect } = require("@playwright/test");

const PREVIEW_URL = "https://is-painting-476gb4klu-ispaintings-projects.vercel.app";

test("job tracking add expense flow is visible and functional", async ({ page }) => {
  await page.goto(`${PREVIEW_URL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("admin@ispainting.com");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard|clock/, { timeout: 20000 });

  await page.goto(`${PREVIEW_URL}/jobs/4`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Tracking" }).click();

  const expensesCard = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Expenses" }) }).first();
  await expect(expensesCard).toBeVisible();

  const addExpenseButton = expensesCard.getByRole("button", { name: "+ Add Expense" });
  await expect(addExpenseButton).toBeVisible();

  const beforeExpenseItems = await expensesCard.locator("ul > li").count().catch(() => 0);

  await addExpenseButton.click();

  const panel = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Add Expense" }) }).first();
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Adding expense to:/i)).toContainText("TEST");
  await expect(panel.getByLabel("Job")).toHaveCount(0);

  await panel.locator('input[type="file"]').first().setInputFiles(".tmp/receipt-test/fixtures/expense_us_receipt.jpg");

  const totalInput = panel.getByLabel("Total");
  const vendorInput = panel.getByLabel("Vendor");

  await expect
    .poll(async () => {
      const vendor = (await vendorInput.inputValue().catch(() => "")).trim();
      const total = (await totalInput.inputValue().catch(() => "")).trim();
      return vendor.length > 0 || total.length > 0;
    }, { timeout: 120000 })
    .toBeTruthy();

  const vendorValue = (await vendorInput.inputValue()).trim();
  const totalValue = (await totalInput.inputValue()).trim();

  await panel.getByRole("button", { name: "Save Expense" }).click();
  await expect(panel).toBeHidden({ timeout: 30000 });

  await page.waitForTimeout(2500);

  const afterExpenseItems = await expensesCard.locator("ul > li").count().catch(() => 0);
  expect(afterExpenseItems).toBeGreaterThanOrEqual(beforeExpenseItems);

  const receiptsCard = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Receipts" }) }).first();
  await expect(receiptsCard).toBeVisible();
  const receiptLinkCount = await receiptsCard.getByRole("link", { name: /Open|View receipt/i }).count();
  expect(receiptLinkCount).toBeGreaterThan(0);

  await page.goto(`${PREVIEW_URL}/expenses`, { waitUntil: "networkidle" });
  const bodyText = (await page.textContent("body")) || "";
  expect(vendorValue.length > 0 || totalValue.length > 0).toBeTruthy();
  expect(bodyText.includes(vendorValue) || bodyText.includes(totalValue)).toBeTruthy();

  await page.screenshot({ path: "/tmp/jobs4-tracking-after-save.png", fullPage: true });
  await page.screenshot({ path: "/tmp/expenses-after-job-save.png", fullPage: true });
});

test("proposal row interactions remain correct", async ({ page }) => {
  await page.goto(`${PREVIEW_URL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("admin@ispainting.com");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard|clock/, { timeout: 20000 });

  await page.goto(`${PREVIEW_URL}/proposals`, { waitUntil: "networkidle" });

  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toBeVisible();

  const projectCell = firstRow.locator("td").nth(2);
  await expect(projectCell.locator("a")).toHaveCount(0);

  const proposalPath = await firstRow.evaluate((row) => {
    const linkLike = row.getAttribute("aria-label") || "";
    return linkLike;
  });
  expect(proposalPath.toLowerCase().includes("open proposal")).toBeTruthy();

  await firstRow.click();
  await expect(page).toHaveURL(/\/proposals\/\d+$/);

  await page.goBack({ waitUntil: "networkidle" });
  const rowAgain = page.locator("tbody tr").first();

  await rowAgain.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/proposals\/\d+$/);

  await page.goBack({ waitUntil: "networkidle" });
  const rowForDelete = page.locator("tbody tr").first();
  await rowForDelete.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("text=Delete Proposal")).toBeVisible();
  await expect(page).toHaveURL(/\/proposals$/);
});
