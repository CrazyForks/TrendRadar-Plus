import { test, expect } from '@playwright/test';
import { ViewerPage } from './pages/viewer.page';

test.describe('News Viewer Page', () => {
  let viewerPage: ViewerPage;

  test.beforeEach(async ({ page }) => {
    viewerPage = new ViewerPage(page);
    await viewerPage.goto();
  });

  test.describe('Page Load', () => {
    test('should display page title', async ({ page }) => {
      await expect(page).toHaveTitle(/Hotnews|热点新闻/);
    });

    test('should display category tabs', async () => {
      await expect(viewerPage.categoryTabs.first()).toBeVisible();
      const tabCount = await viewerPage.categoryTabs.count();
      expect(tabCount).toBeGreaterThan(0);
    });

    test('should have first tab active by default', async () => {
      const firstTab = viewerPage.categoryTabs.first();
      await expect(firstTab).toHaveClass(/active/);
    });

    test('should display platform cards', async () => {
      await expect(viewerPage.platformCards.first()).toBeVisible();
      const cardCount = await viewerPage.platformCards.count();
      expect(cardCount).toBeGreaterThan(0);
    });

    test('should display news items in platform cards', async () => {
      const newsItems = await viewerPage.getNewsItems(0);
      const count = await newsItems.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('Tab Navigation', () => {
    test('should switch tabs when clicked', async () => {
      const tabCount = await viewerPage.categoryTabs.count();
      if (tabCount > 1) {
        const secondTab = viewerPage.categoryTabs.nth(1);
        const tabId = await secondTab.getAttribute('data-category');
        
        await secondTab.click();
        
        await expect(secondTab).toHaveClass(/active/);
        const firstTab = viewerPage.categoryTabs.first();
        await expect(firstTab).not.toHaveClass(/active/);
        
        // Verify content pane is visible
        const contentPane = viewerPage.page.locator(`#tab-${tabId}`);
        await expect(contentPane).toHaveClass(/active/);
      }
    });
  });

  test.describe('News Interaction', () => {
    test('should mark news as read when checkbox clicked', async () => {
      const firstNewsCheckbox = viewerPage.platformCards.first()
        .locator('.news-item').first()
        .locator('.news-checkbox');
      
      await expect(firstNewsCheckbox).not.toBeChecked();
      await firstNewsCheckbox.click();
      await expect(firstNewsCheckbox).toBeChecked();
    });
  });

});

test.describe('Per-Category Filter', () => {
  let viewerPage: ViewerPage;

  test.beforeEach(async ({ page }) => {
    viewerPage = new ViewerPage(page);
    await viewerPage.goto();
  });

  test('should hide empty platforms when category filter mode is include (显示)', async ({ page }) => {
    await viewerPage.openCategorySettings();
    await viewerPage.openFirstCategoryEditPanel();
    await viewerPage.setCategoryFilterIncludeMode();

    const keyword = '__pw_unmatchable_keyword__' + Date.now();
    await viewerPage.addCategoryFilterKeyword(keyword);

    await viewerPage.saveSettingsButton.click();
    await viewerPage.settingsModal.waitFor({ state: 'hidden' });

    const activeTabId = await page.locator('.category-tabs .category-tab.active').getAttribute('data-category');
    await expect
      .poll(async () => {
        return await page
          .locator(`#tab-${activeTabId} .platform-card:not(.platform-hidden):not(.platform-empty-hidden)`)
          .count();
      })
      .toBe(0);
  });
});

