import { expect, type Locator, type Page } from '@playwright/test';

type Scope = Page | Locator;

export function choiceTrigger(scope: Scope, label: string) {
  const name = new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '：');
  return scope.getByRole('button', { name }).and(scope.locator('button.choice-trigger'));
}

export async function openChoice(scope: Scope, label: string) {
  const trigger = choiceTrigger(scope, label);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const id = await trigger.getAttribute('aria-controls');
  const page = 'page' in scope ? scope.page() : scope;
  const panel = page.locator(`[id=${JSON.stringify(id)}]`);
  await expect(panel).toBeVisible();
  return { trigger, panel, options: panel.getByRole('option') };
}

export async function selectChoice(scope: Scope, label: string, value: string) {
  const { trigger, panel, options } = await openChoice(scope, label);
  const option = options.and(panel.locator(`[data-value=${JSON.stringify(value)}]`));
  if (!(await option.count())) {
    const previous = panel.getByRole('button', { name: '上一页', exact: true });
    while (!(await option.count()) && (await previous.count()) && (await previous.isEnabled())) {
      await previous.click();
    }
    const next = panel.getByRole('button', { name: '下一页', exact: true });
    while (!(await option.count()) && (await next.count()) && (await next.isEnabled())) {
      await next.click();
    }
  }
  await option.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
}

export async function expectChoiceValue(scope: Scope, label: string, value: string) {
  const { panel } = await openChoice(scope, label);
  await expect(panel.getByRole('option', { selected: true })).toHaveAttribute('data-value', value);
  await panel.getByRole('button', { name: `收起${label}选项`, exact: true }).click();
}
