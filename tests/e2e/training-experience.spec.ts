import { expect, test, type Page } from '@playwright/test';
import { createInitialData } from '../../src/domain/seed';
import { createSession, createSessionExercise } from '../../src/domain/training';
import { storedWorkspace, expectPersisted } from './helpers';
import type { AppData } from '../../src/domain/types';

function fixture(exerciseId = 'ex-squat') {
  const data = createInitialData();
  const exercise = data.exercises.find((exercise) => exercise.id === exerciseId)!;
  data.templates[0].items = [{ id: 'test-item', exerciseId, sets: 3, weightKg: 0, reps: 10, durationSeconds: 30 }];
  data.templates[0].restSeconds = 10;
  const history = createSession(null, data.exercises, Date.parse('2026-10-16T02:00:00Z'));
  history.status = 'completed';
  history.finishedAt = '2026-10-16T02:40:00.000Z';
  history.updatedAt = history.finishedAt;
  history.exercises = [createSessionExercise(exercise, 2, 60, 8, 50)];
  history.exercises[0].sets[0].status = 'completed';
  history.exercises[0].sets[1] = {
    ...history.exercises[0].sets[1],
    type: 'warmup',
    status: 'completed',
    weightKg: 200,
    reps: 20,
    durationSeconds: 120,
  };
  data.sessions = [history];
  data.onboarded = true;
  return data;
}
async function install(page: Page, data: AppData) {
  await page.clock.install({ time: new Date('2026-10-17T06:00:00Z') });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始自由训练', exact: true })).toBeEnabled();
  await page.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('jianlibao', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put(data, 'main');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
    data,
  );
  await page.reload();
  await expect(page.getByRole('button', { name: '开始今天的训练', exact: true })).toBeEnabled();
}
async function start(page: Page) {
  await page.getByRole('button', { name: '开始今天的训练', exact: true }).click();
}

test.describe('手机原地记组', () => {
  test.use({ hasTouch: true });

  for (const [width, height] of [[320, 568], [390, 740]]) {
    test(`${width}px 连记四组，重开保持当前组和剩余休息`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      const data = fixture();
      data.templates[0].items[0].sets = 4;
      data.templates[0].restSeconds = 90;
      await install(page, data);
      await start(page);
      const control = (group: number) => page.getByRole('button', { name: `完成杠铃深蹲第${group}组`, exact: true });
      const region = page.locator('.workout-view');
      const rest = page.getByRole('region', { name: '组间休息' });
      const first = (await control(1).boundingBox())!;
      const tap = { x: first.x + first.width / 2, y: first.y + first.height / 2 };
      await control(1).evaluate((button) => {
        const observer = new MutationObserver(() => {
          observer.disconnect();
          button.setAttribute('data-test-second-tap', 'sent');
          button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
        });
        observer.observe(button, { attributeFilter: ['aria-label'] });
      });

      for (let group = 1; group <= 4; group++) {
        const active = control(group);
        await expect(active).toBeEnabled();
        await expect.poll(() => active.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), tap)).toBe(true);
        await expect(page.getByLabel(`杠铃深蹲第${group}组总重量`, { exact: true })).toBeInViewport();
        const quick = page.getByRole('button', { name: `增加杠铃深蹲第${group}组次数`, exact: true });
        const adjustBounds = (await quick.boundingBox())!;
        const regionBounds = (await region.boundingBox())!;
        expect(adjustBounds.y + adjustBounds.height).toBeLessThanOrEqual(regionBounds.y + regionBounds.height + 1);
        expect(await region.evaluate((element) => element.scrollTop)).toBe(0);
        await page.touchscreen.tap(tap.x, tap.y);
        await expectPersisted(page, ({ sessions }) => sessions.at(-1)?.exercises[0].sets.filter((set) => set.status === 'completed').length === group);
        await expect(rest).toHaveAttribute('data-rest-running', 'true');

        if (group === 1) {
          await expect(control(2)).toHaveAttribute('data-test-second-tap', 'sent');
          const deadline = (await storedWorkspace(page)).sessions.at(-1)!.restUntil;
          await page.reload();
          await expect(control(2)).toBeEnabled();
          expect((await storedWorkspace(page)).sessions.at(-1)!.restUntil).toBe(deadline);
          await expect(rest).toHaveAttribute('data-rest-running', 'true');
          await page.screenshot({ path: info.outputPath(`${width}-current-second-set.png`), animations: 'disabled' });
        }
        await page.clock.fastForward(400);
      }
      await page.getByRole('button', { name: '结束训练', exact: true }).tap();
      await expect(page).toHaveURL(/#\/progress$/);
      await expectPersisted(page, ({ sessions }) => sessions.at(-1)?.status === 'completed');
    });
  }

  test('逐组参考保留模板目标，选择历史只填当前组', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const data = fixture();
    const move = data.sessions[0].exercises[0];
    const history = createSessionExercise(move.exercise, 4).sets;
    const marks = [[50, 12], [60, 8], [65, 6], [55, 10]];
    move.sets = [move.sets[1], ...history.map((set, index) => ({
      ...set, status: 'completed' as const, weightKg: marks[index][0], reps: marks[index][1],
    }))];
    move.note = '上次用了深蹲架 3 档';
    Object.assign(data.templates[0].items[0], { sets: 4, weightKg: 62.5, reps: 7 });
    await install(page, data);
    await start(page);
    await expect(page.getByLabel('杠铃深蹲第1组总重量', { exact: true })).toHaveValue('62.5');
    await expect(page.getByLabel('杠铃深蹲第1组次数', { exact: true })).toHaveValue('7');
    const prior = page.getByRole('button', { name: '用上次杠铃深蹲第1组成绩', exact: true });
    await expect(prior).toContainText('50 kg × 12');
    await prior.tap();
    await page.getByRole('button', { name: '完成杠铃深蹲第1组', exact: true }).tap();
    await expect(page.getByRole('button', { name: '用上次杠铃深蹲第2组成绩', exact: true })).toContainText('60 kg × 8');
    await page.getByText('逐组历史', { exact: true }).tap();
    await expect(page.getByText('上次用了深蹲架 3 档')).toBeVisible();
    await page.getByRole('button', { name: '填入历史正式第3组', exact: true }).tap();
    await expectPersisted(page, ({ sessions }) => {
      const sets = sessions.at(-1)!.exercises[0].sets;
      return sets[0].status === 'completed' && sets[0].weightKg === 50 && sets[0].reps === 12 &&
        sets[1].status === 'pending' && sets[1].weightKg === 65 && sets[1].reps === 6 &&
        sets.slice(2).every((set) => set.weightKg === 62.5 && set.reps === 7 && set.status === 'pending');
    });
    expect((await storedWorkspace(page)).sessions[0]).toEqual(data.sessions[0]);
  });

  test('先练最后一个动作后，固定栏可回到尚未记录的动作', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const data = fixture();
    data.templates[0].items[0].sets = 1;
    data.templates[0].items.push({ id: 'test-last-move', exerciseId: 'ex-plank', sets: 1, weightKg: 0, reps: 1, durationSeconds: 30 });
    await install(page, data);
    await start(page);
    await page.getByRole('button', { name: '下一动作', exact: true }).tap();
    await expect(page.getByLabel('平板支撑第1组时长', { exact: true })).toBeInViewport();
    await page.getByRole('button', { name: '完成平板支撑第1组', exact: true }).tap();
    await page.getByRole('button', { name: '回到待练动作', exact: true }).tap();
    await expect(page.getByRole('button', { name: '完成杠铃深蹲第1组', exact: true })).toBeInViewport();
    await expectPersisted(page, ({ sessions }) => sessions.at(-1)?.exercises[1].sets[0].status === 'completed');
  });

  test('从历史复练逐组带入实际值和类型，原记录保留', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const data = fixture();
    const original = data.sessions[0];
    const move = original.exercises[0];
    move.sets = [
      { ...move.sets[1], weightKg: 30, reps: 12 },
      { ...move.sets[0], weightKg: 60, reps: 8, rpe: 8 },
      { ...move.sets[0], id: 'repeat-set-three', weightKg: 55, reps: 10, type: 'drop' },
      { ...move.sets[0], id: 'repeat-skipped', status: 'skipped' },
    ];
    await install(page, data);
    await page.goto('/#/progress');
    await page.locator('.session-card').first().tap();
    await page.getByRole('button', { name: '再练一次', exact: true }).tap();
    await page.getByRole('button', { name: '确认开始训练', exact: true }).tap();
    await expect(page.getByLabel('杠铃深蹲第1组总重量', { exact: true })).toHaveValue('30');
    await expectPersisted(page, ({ sessions }) => sessions.length === 2);
    const saved = await storedWorkspace(page);
    expect(saved.sessions[0]).toEqual(original);
    const draft = saved.sessions[1];
    expect(draft.exercises[0].sets.map(({ type, weightKg, reps, status, rpe }) => [type, weightKg, reps, status, rpe])).toEqual([
      ['warmup', 30, 12, 'pending', undefined], ['work', 60, 8, 'pending', undefined], ['drop', 55, 10, 'pending', undefined],
    ]);
    expect(draft.restUntil).toBeNull();
  });
});

test('练完所有组后从固定结束入口直接归档', async ({ page }) => {
  const data = fixture();
  data.templates[0].items[0].sets = 1;
  await install(page, data);
  await start(page);
  await page.getByRole('button', { name: '完成杠铃深蹲第1组', exact: true }).click();
  await page.getByRole('button', { name: '结束训练', exact: true }).click();
  await expect(page).toHaveURL(/#\/progress$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectPersisted(page, ({ sessions }) => sessions.length === 2 && sessions[1].status === 'completed');
});

async function observeAlerts(page: Page) {
  await page.addInitScript(() => {
    const observed = { audio: 0, vibration: 0 };
    (window as unknown as { observedAlerts: typeof observed }).observedAlerts = observed;
    class AudioStub {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
      addEventListener() {}
      removeEventListener() {}
      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            linearRampToValueAtTime(value: number) {
              if (value > 0) observed.audio++;
            },
          },
          connect() {},
          disconnect() {},
        };
      }
      createOscillator() {
        return {
          frequency: { setValueAtTime() {} },
          connect() {},
          disconnect() {},
          start() {},
          stop() {},
          onended: null,
        };
      }
    }
    Object.defineProperty(window, 'AudioContext', { value: AudioStub, configurable: true });
    Object.defineProperty(navigator, 'vibrate', {
      value: (pattern: number | number[]) => {
        if (Array.isArray(pattern) && pattern.some((value) => value > 0)) observed.vibration++;
        return true;
      },
      configurable: true,
    });
  });
}
async function alertCounts(page: Page) {
  return page.evaluate(
    () => (window as unknown as { observedAlerts: { audio: number; vibration: number } }).observedAlerts,
  );
}

test('休息结束声音震动仅一次，延长取消旧截止', async ({ page }) => {
  await observeAlerts(page);
  await install(page, fixture());
  await start(page);
  await page.getByRole('button', { name: '完成杠铃深蹲第1组', exact: true }).click();
  await page.getByRole('button', { name: '+30 秒', exact: true }).click();
  await page.clock.fastForward(11_000);
  expect(await alertCounts(page)).toEqual({ audio: 0, vibration: 0 });
  await page.clock.fastForward(30_000);
  await expect.poll(() => alertCounts(page)).toEqual({ audio: 1, vibration: 1 });
  await expect(page.locator('.toast')).toContainText('休息结束');
  await page.clock.fastForward(10_000);
  expect(await alertCounts(page)).toEqual({ audio: 1, vibration: 1 });
});

test('提醒开关可关闭，跳过和暂停不会误提醒', async ({ page }) => {
  await observeAlerts(page);
  await install(page, fixture());
  await start(page);
  await page.getByRole('button', { name: '完成杠铃深蹲第1组', exact: true }).click();
  await page.getByRole('button', { name: '跳过休息', exact: true }).click();
  await page.clock.fastForward(11_000);
  expect(await alertCounts(page)).toEqual({ audio: 0, vibration: 0 });
  await page.getByRole('button', { name: '完成杠铃深蹲第2组', exact: true }).click();
  await page.getByRole('button', { name: '暂停训练', exact: true }).click();
  await page.clock.fastForward(11_000);
  expect(await alertCounts(page)).toEqual({ audio: 0, vibration: 0 });
  await page.getByRole('button', { name: '继续训练', exact: true }).click();
  await page.getByText('休息提醒设置', { exact: true }).click();
  await page.getByRole('button', { name: '声音提醒', exact: true }).click();
  await page.getByRole('button', { name: '震动提醒', exact: true }).click();
  await page.getByRole('button', { name: '完成杠铃深蹲第3组', exact: true }).click();
  await page.clock.fastForward(11_000);
  await expect(page.locator('.toast')).toContainText('休息结束');
  expect(await alertCounts(page)).toEqual({ audio: 0, vibration: 0 });
});

test('无声音震动API仍显示休息结束且不破坏记录', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await install(page, fixture());
  await start(page);
  await page.getByRole('button', { name: '完成杠铃深蹲第1组', exact: true }).click();
  await page.clock.fastForward(11_000);
  await expect(page.locator('.toast')).toContainText('休息结束');
  await expectPersisted(page, (data) => data.sessions.at(-1)!.exercises[0].sets[0].status === 'completed');
  expect(errors).toEqual([]);
});

test('可填入同组正式成绩，刷新不覆盖已编辑草稿或历史', async ({ page }) => {
  const data = fixture();
  await install(page, data);
  await start(page);
  const weight = page.getByLabel('杠铃深蹲第1组总重量', { exact: true });
  await expect(weight).toHaveValue('0');
  await page.getByRole('button', { name: '用上次杠铃深蹲第1组成绩', exact: true }).click();
  await expect(weight).toHaveValue('60');
  await expect(page.getByLabel('杠铃深蹲第1组次数', { exact: true })).toHaveValue('8');
  await expect(page.getByText('待完成组为建议值，确认后才计入记录。', { exact: true })).toBeVisible();
  await weight.fill('67.5');
  await expectPersisted(page, (d) => d.sessions.at(-1)!.exercises[0].sets[0].weightKg === 67.5);
  await page.reload();
  await expect(page.getByLabel('杠铃深蹲第1组总重量', { exact: true })).toHaveValue('67.5');
  const saved = await storedWorkspace(page);
  expect(saved.sessions[0]).toEqual(data.sessions[0]);
  expect(saved.sessions.at(-1)!.exercises[0].sets.every((set) => set.status === 'pending')).toBe(true);
});

test('增加一组优先本次实际成绩，复制上一组只填数值不完成', async ({ page }) => {
  await install(page, fixture());
  await start(page);
  await page.getByLabel('杠铃深蹲第1组总重量', { exact: true }).fill('70');
  await page.getByLabel('杠铃深蹲第1组次数', { exact: true }).fill('6');
  await page.getByRole('button', { name: '完成杠铃深蹲第1组', exact: true }).click();
  await page.getByRole('button', { name: '增加一组', exact: true }).click();
  await expect(page.getByLabel('杠铃深蹲第4组总重量', { exact: true })).toHaveValue('70');
  await expect(page.getByLabel('杠铃深蹲第4组次数', { exact: true })).toHaveValue('6');
  await page.getByRole('button', { name: '复制杠铃深蹲第1组到第2组', exact: true }).click();
  await expect(page.getByLabel('杠铃深蹲第2组总重量', { exact: true })).toHaveValue('70');
  const saved = await storedWorkspace(page);
  expect(saved.sessions.at(-1)!.exercises[0].sets[1].status).toBe('pending');
  expect(saved.sessions.at(-1)!.exercises[0].sets[3].status).toBe('pending');
});

test('kg重量次数快调有界，完成与暂停时不可改', async ({ page }) => {
  await install(page, fixture());
  await start(page);
  await page.getByRole('button', { name: '用上次杠铃深蹲第1组成绩', exact: true }).click();
  const plus = page.getByRole('button', { name: '增加杠铃深蹲第1组总重量', exact: true });
  const minus = page.getByRole('button', { name: '减少杠铃深蹲第1组总重量', exact: true });
  await plus.click();
  await expect(page.getByLabel('杠铃深蹲第1组总重量', { exact: true })).toHaveValue('62.5');
  await minus.click();
  await expect(page.getByLabel('杠铃深蹲第1组总重量', { exact: true })).toHaveValue('60');
  await page.getByRole('button', { name: '增加杠铃深蹲第1组次数', exact: true }).click();
  await expect(page.getByLabel('杠铃深蹲第1组次数', { exact: true })).toHaveValue('9');
  await page.getByLabel('杠铃深蹲第1组总重量', { exact: true }).fill('0');
  await expect(minus).toBeDisabled();
  await page.getByLabel('杠铃深蹲第1组次数', { exact: true }).fill('1');
  await expect(page.getByRole('button', { name: '减少杠铃深蹲第1组次数', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '完成杠铃深蹲第1组', exact: true }).click();
  await expect(plus).toBeDisabled();
  await page.getByRole('button', { name: '暂停训练', exact: true }).click();
  await expect(page.getByRole('button', { name: '增加杠铃深蹲第2组总重量', exact: true })).toBeDisabled();
});

test('lb快调5lb，原始kg与历史不因单位转换重写', async ({ page }) => {
  const data = fixture();
  data.settings.unit = 'lb';
  await install(page, data);
  await start(page);
  const weight = page.getByLabel('杠铃深蹲第1组总重量', { exact: true });
  await page.getByRole('button', { name: '用上次杠铃深蹲第1组成绩', exact: true }).click();
  await expect(weight).toHaveValue('132.28');
  await page.getByRole('button', { name: '增加杠铃深蹲第1组总重量', exact: true }).click();
  await expect(weight).toHaveValue('137.28');
  await page.getByRole('button', { name: '减少杠铃深蹲第1组总重量', exact: true }).click();
  await expect(weight).toHaveValue('132.28');
  const saved = await storedWorkspace(page);
  expect(saved.sessions[0]).toEqual(data.sessions[0]);
  expect(saved.sessions.at(-1)!.exercises[0].sets[0].weightKg).toBeCloseTo(60, 5);
});

for (const [id, name, field, value] of [
  ['ex-pushup', '俯卧撑', '次数', '8'],
  ['ex-plank', '平板支撑', '时长', '50'],
])
  test(`${field}类可显式使用实际成绩并支持快调`, async ({ page }) => {
    await install(page, fixture(id));
    await start(page);
    const input = page.getByLabel(`${name}第1组${field}`, { exact: true });
    await page.getByRole('button', { name: `用上次${name}第1组成绩`, exact: true }).click();
    await expect(input).toHaveValue(value);
    await page.getByRole('button', { name: `增加${name}第1组${field}`, exact: true }).click();
    await expect(input).toHaveValue(String(Number(value) + 1));
  });

for (const width of [320, 390, 768, 1440])
  test(`${width}px训练控件深浅主题均无导航和休息浮层遮挡`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const data = fixture();
    // Keep the enabled Skip button in the hit-test enumeration in both themes.
    data.templates[0].restSeconds = 180;
    await install(page, data);
    await start(page);
    if (width <= 760) await expect(page.getByRole('navigation', { name: '移动端导航', exact: true })).toHaveCount(0);
    if (width <= 760) {
      const firstComplete = (await page.getByRole('button', { name: '完成杠铃深蹲第1组', exact: true }).boundingBox())!;
      const scrollArea = (await page.locator('.workout-view').boundingBox())!;
      expect(firstComplete.y).toBeGreaterThanOrEqual(scrollArea.y + scrollArea.height);
      expect(firstComplete.y + firstComplete.height).toBeLessThanOrEqual(844);
    }
    await page.getByRole('button', { name: '完成杠铃深蹲第1组', exact: true }).click();
    await expect(page.getByRole('region', { name: '组间休息' })).toHaveAttribute('data-rest-running', 'true');
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.getByRole('button', { name: '切换主题', exact: true }).click();
      for (const element of await page
        .locator(
          '.workout-view button:not(:disabled),.workout-view input:not(:disabled),.workout-view select:not(:disabled)',
        )
        .all()) {
        if (!(await element.isVisible())) continue;
        await element.scrollIntoViewIfNeeded();
        expect(
          await element.evaluate((element) => {
            const r = element.getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return element === hit || element.contains(hit);
          }),
        ).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      if (width <= 760) {
        const content = (await page.locator('.workout-view').boundingBox())!;
        const panel = (await page.locator('.rest-panel').boundingBox())!;
        expect(content.y + content.height).toBeLessThanOrEqual(panel.y);
      }
      await page.screenshot({ path: info.outputPath(`training-${width}-${theme}.png`) });
    }
  });

test('短视口与非零安全区自动收起休息，输入和固定操作可达', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page, fixture());
  await start(page);
  await page.getByRole('button', { name: '完成杠铃深蹲第1组', exact: true }).click();
  await page.getByRole('button', { name: '展开休息面板', exact: true }).click();
  await expect(page.getByRole('button', { name: '收起休息面板', exact: true })).toBeVisible();
  await page.addStyleTag({
    content: ':root { --safe-top:24px; --safe-bottom:20px; --safe-left:12px; --safe-right:16px; }',
  });
  await page.setViewportSize({ width: 390, height: 480 });
  await expect(page.getByRole('button', { name: '展开休息面板', exact: true })).toBeVisible();
  const input = page.getByLabel('杠铃深蹲第2组总重量', { exact: true });
  await input.fill('65');
  await input.scrollIntoViewIfNeeded();
  expect(
    await input.evaluate((element) => {
      const r = element.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === element || element.contains(hit);
    }),
  ).toBe(true);
  const footer = await page.locator('.workout-footer').boundingBox();
  expect(footer!.x).toBe(0);
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(480);
});

test('空自由训练的休息面板避开底部安全区', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page, fixture());
  await page
    .getByRole('navigation', { name: '移动端导航', exact: true })
    .getByRole('button', { name: '计划', exact: true })
    .click();
  await page.getByRole('button', { name: '直接开始自由训练', exact: true }).click();
  await page.addStyleTag({
    content: ':root { --safe-top:24px; --safe-bottom:34px; --safe-left:12px; --safe-right:16px; }',
  });
  const bounds = (await page.locator('.rest-panel').boundingBox())!;
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844 - 34);
  await page.getByRole('button', { name: '添加动作', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('离开训练页后仍收到一次休息提醒，记录保持活动', async ({ page }) => {
  await observeAlerts(page);
  await install(page, fixture());
  await start(page);
  await page.getByRole('button', { name: '完成杠铃深蹲第1组', exact: true }).click();
  await page.getByRole('button', { name: '返回今天', exact: true }).click();
  await page.clock.fastForward(11_000);
  await expect(page.locator('.toast')).toContainText('休息结束');
  expect(await alertCounts(page)).toEqual({ audio: 1, vibration: 1 });
  expect((await storedWorkspace(page)).sessions.at(-1)!.status).toBe('active');
});
