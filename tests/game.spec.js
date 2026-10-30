import { test, expect } from "@playwright/test";
import fs from "node:fs";
const questions = JSON.parse(
  fs.readFileSync(new URL("../src/questions.json", import.meta.url)),
);
const blank = () => ({
  version: 1,
  profile: { name: "นักเรียน ทดสอบ", classroom: "ม.1/1", number: "9" },
  answers: Array(30).fill(null),
  stage: 0,
});
async function seed(page, s) {
  await page.addInitScript(
    (s) => localStorage.setItem("weather-quest-v1", JSON.stringify(s)),
    s,
  );
  await page.goto("/");
  await page.locator("#resume").click();
}
for (const answer of [1, 0]) {
  test(`registration, movement, ${answer === 1 ? "correct" : "wrong"} scoring, progress and CSV`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
    await page.clock.pauseAt(new Date("2026-10-30T12:00:00Z"));
    await page.goto("/");
    await page.locator("[name=name]").fill("เด็กชาย สำรวจ");
    await page.locator("[name=classroom]").fill("ม.1/2");
    await page.locator("[name=number]").fill("12");
    await page.locator("#register button").click();
    await expect(page.locator("#stageTitle")).toContainText("1.");
    // Turn left, walk to the first station, then walk north.
    await page.keyboard.down("KeyA");
    await page.clock.runFor(680);
    await page.keyboard.up("KeyA");
    await page.keyboard.down("KeyW");
    await page.clock.runFor(2000);
    await page.keyboard.up("KeyW");
    await page.keyboard.down("KeyD");
    await page.clock.runFor(680);
    await page.keyboard.up("KeyD");
    await page.keyboard.down("KeyW");
    await page.clock.runFor(1750);
    await page.keyboard.up("KeyW");
    await page.clock.runFor(32);
    await expect(page.locator("#hint")).toBeVisible();
    await page.keyboard.press("KeyE");
    await expect(page.locator(".card h2")).toHaveText(questions[0].question);
    await page.locator(`[data-answer="${answer}"]`).click();
    await expect(page.locator("#feedback")).toContainText(
      questions[0].explanation,
    );
    await expect(page.locator("#score")).toHaveText(
      `${answer === 1 ? 1 : 0} / 30`,
    );
    await expect(page.locator('[data-answer="1"]')).toBeDisabled();
    await page.locator("#cancel").click();
    await page.reload();
    await page.locator("#resume").click();
    await expect(page.locator("#score")).toHaveText(
      `${answer === 1 ? 1 : 0} / 30`,
    );
    await page.locator("#summaryOpen").click();
    const download = page.waitForEvent("download");
    await page.locator("#download").click();
    const d = await download;
    const data = fs.readFileSync(await d.path(), "utf8");
    expect(data).toContain("เด็กชาย สำรวจ");
    expect(data).toContain(questions[29].question);
    expect(data.split("\r\n")).toHaveLength(32);
    expect(errors).toEqual([]);
  });
}
test("six labs, stage transition, full score and restart", async ({ page }) => {
  for (let stage = 0; stage < 6; stage++) {
    const s = blank();
    s.stage = stage;
    await seed(page, s);
    await page.locator("#labOpen").click();
    await expect(page.locator("#labResult")).not.toBeEmpty();
    const input = page.locator("#labInput");
    const before = await page.locator("#labResult").textContent();
    if (await input.evaluate((el) => el.tagName === "SELECT"))
      await input.selectOption("1");
    else await input.fill(stage === 0 ? "4000" : stage === 2 ? "38" : "160");
    await expect(page.locator("#labResult")).not.toHaveText(before);
  }
  const s = blank();
  s.answers = questions.map((q) => q.answer);
  s.answers[29] = null;
  s.stage = 4;
  await seed(page, s);
  await page.locator("#summaryOpen").click();
  await page.locator("#goNext").click();
  await expect(page.locator(".eyebrow").last()).toContainText("ว 3.2 ม.1/6–7");
  await page.locator("#labClose").click();
  await expect(page.locator("#stageTitle")).toContainText("6.");
  const complete = blank();
  complete.answers = questions.map((q) => q.answer);
  complete.stage = 5;
  await seed(page, complete);
  await expect(page.locator(".bigscore")).toContainText("30");
  await page.locator("#restart").click();
  await page.locator("#yesRestart").click();
  await expect(page.locator("#score")).toHaveText("0 / 30");
  await expect(page.locator("#stageTitle")).toContainText("1.");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("weather-quest-v1")).answers.every(
        (a) => a === null,
      ),
    ),
  ).toBe(true);
});
test("touch controls and labs fit mobile", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await seed(page, blank());
  await expect(page.locator("#mobile")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#labOpen").tap();
  await expect(page.locator("#labInput")).toBeVisible();
  await page.locator("#labClose").tap();
  const up = await page.locator("[data-key=ArrowUp]").boundingBox();
  await page.mouse.move(up.x + up.width / 2, up.y + up.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.screenshot({ path: "test-results/mobile.png" });
  await context.close();
});
