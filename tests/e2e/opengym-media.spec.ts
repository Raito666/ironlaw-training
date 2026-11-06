import { expectChoiceValue, openChoice, selectChoice } from './choice-helpers';
import { expect, test } from '@playwright/test';
import { storedWorkspace } from './helpers';
import { overflowFindings } from './overflow-helpers';

test.skip(true, 'OpenGym/Gym Visual playback requires separately licensed local media. The public edition ships the catalogue text.');

for (const width of [320,390,768,1440]) for (const theme of ['dark','light']) {
  test(`${width}px ${theme}: Ironlaw media plays, switches source variants and reopens offline`, async ({page,context}, info) => {
    test.setTimeout(60000);
    await page.setViewportSize({width,height:844});
    await page.goto('/#/settings');
    await expect(page).toHaveTitle(/铁律 IRONLAW/);
    await selectChoice(page, '界面主题', theme);
    await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
    const before = await storedWorkspace(page);
    await page.goto('/#/today');
    await expect(page.getByRole('button',{name:'开始今天的训练',exact:true})).toBeEnabled();
    await page.screenshot({path:info.outputPath(`ironlaw-today-${width}-${theme}.png`),animations:'disabled'});
    await page.goto('/#/exercises');
    await page.getByLabel('搜索动作',{exact:true}).fill('3/4 sit-up');
    await page.locator('.opengym-thumbnail img').scrollIntoViewIfNeeded();
    await expect(page.locator('.opengym-thumbnail img')).toHaveJSProperty('naturalWidth',180);
    await page.getByRole('button',{name:'查看3/4仰卧起坐图文讲解',exact:true}).click();
    const media=page.locator('.opengym-media');
    await media.locator('.opengym-still img').scrollIntoViewIfNeeded();
    await expect(media.locator('.opengym-still img')).toHaveJSProperty('naturalWidth',180);
    const { options } = await openChoice(media, '示范版本');
    expect(await options.count()).toBeGreaterThan(1);
    const id = await options.nth(1).getAttribute('data-value');
    expect(id).not.toBeNull();
    await options.nth(1).click();
    await expectChoiceValue(media, '示范版本', id!);
    await expect(media.locator('.opengym-still img')).toHaveAttribute('src', `/exercise-opengym-media/v1/still/${id}.webp`);
    await selectChoice(media, '示范版本', '0001');
    await media.getByRole('button',{name:'视频示范',exact:true}).click();
    const movie=media.locator('video');
    await movie.evaluate((v:HTMLVideoElement)=>v.play());
    await expect.poll(()=>movie.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.1);
    await movie.evaluate((v:HTMLVideoElement)=>v.pause());
    await media.getByRole('button',{name:'保存此版本图片与视频供离线使用',exact:true}).click();
    await expect(media.getByRole('button',{name:'图片与视频已校验，可离线查看',exact:true})).toBeVisible();
    expect(await overflowFindings(page)).toEqual([]);
    await page.screenshot({path:info.outputPath(`ironlaw-media-${width}-${theme}.png`),animations:'disabled'});
    await context.setOffline(true); await page.reload();
    await page.getByLabel('搜索动作',{exact:true}).fill('3/4 sit-up');
    await page.getByRole('button',{name:'查看3/4仰卧起坐图文讲解',exact:true}).click();
    await expect(media.locator('.opengym-still img')).toHaveJSProperty('naturalWidth',180);
    await expect(media.getByRole('button',{name:'图片与视频已校验，可离线查看',exact:true})).toBeVisible();
    await media.getByRole('button',{name:'视频示范',exact:true}).click();
    await media.locator('video').evaluate((v:HTMLVideoElement)=>v.play());
    await expect.poll(()=>media.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.1);
    await media.locator('video').evaluate((v:HTMLVideoElement)=>v.pause());
    expect(await storedWorkspace(page)).toEqual(before);
  });
}
