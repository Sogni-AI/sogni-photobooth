import { test, expect, Page } from '@playwright/test';

// Helper to wait for animations to complete
const waitForAnimations = async (page: Page) => {
  await page.waitForTimeout(300); // Match our CSS animation durations
};

test.describe('Component Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Style Selector States', async ({ page }) => {
    // Default state
    await expect(page.locator('.bottom-style-select')).toHaveScreenshot('style-button-default.png', {
      maxDiffPixelRatio: 0.01
    });

    // Hover state
    await page.hover('.bottom-style-select');
    await waitForAnimations(page);
    await expect(page.locator('.bottom-style-select')).toHaveScreenshot('style-button-hover.png', {
      maxDiffPixelRatio: 0.01
    });

    // Open dropdown
    await page.click('[class*="styleButton"]');
    await waitForAnimations(page);
    await expect(page.locator('[class*="styleDropdown"]')).toHaveScreenshot('style-dropdown-open.png', {
      maxDiffPixelRatio: 0.01
    });

    // Selected state
    await page.click('.style-option:has-text("Random: All")');
    await waitForAnimations(page);
    await expect(page.locator('.bottom-style-select')).toHaveScreenshot('style-button-selected.png', {
      maxDiffPixelRatio: 0.01
    });
  });

  test('Settings Panel States', async ({ page }) => {
    // Default state
    await expect(page.locator('.header-config-btn')).toHaveScreenshot('settings-button-default.png', {
      maxDiffPixelRatio: 0.01
    });

    // Hover state
    await page.hover('.header-config-btn');
    await waitForAnimations(page);
    await expect(page.locator('.header-config-btn')).toHaveScreenshot('settings-button-hover.png', {
      maxDiffPixelRatio: 0.01
    });

    // Open panel
    await page.click('.header-config-btn');
    await waitForAnimations(page);
    await expect(page.locator('.control-overlay.visible')).toHaveScreenshot('settings-panel-open.png', {
      maxDiffPixelRatio: 0.01
    });

    // Panel with custom style selected
    await page.click('.style-option:has-text("Custom")');
    await waitForAnimations(page);
    await expect(page.locator('.control-overlay')).toHaveScreenshot('settings-panel-custom.png', {
      maxDiffPixelRatio: 0.01
    });
  });

  test('Component Layout Measurements', async ({ page }) => {
    // Verify style button dimensions and position
    const styleButton = page.locator('[class*="styleButton"]');
    const styleButtonBox = await styleButton.boundingBox();
    if (!styleButtonBox) {
      throw new Error('Style button not found or not visible');
    }
    expect(styleButtonBox.width).toBeGreaterThan(100); // Should be wide enough for text
    expect(styleButtonBox.height).toBe(36); // Fixed height from CSS

    // Verify dropdown positioning relative to button
    await page.click('[class*="styleButton"]');
    await waitForAnimations(page);
    const dropdown = page.locator('[class*="styleDropdown"]');
    const dropdownBox = await dropdown.boundingBox();
    if (!dropdownBox) {
      throw new Error('Dropdown not found or not visible after clicking button');
    }
    
    // Dropdown should be aligned with button
    expect(dropdownBox.x).toBeCloseTo(styleButtonBox.x, 1);
    expect(dropdownBox.width).toBe(240); // Fixed width from CSS
  });

  test('Style Options Visual Consistency', async ({ page }) => {
    await page.click('[class*="styleButton"]');
    await waitForAnimations(page);

    // Check each style option
    const options = await page.locator('.style-option').all();
    for (const option of options) {
      const box = await option.boundingBox();
      if (!box) {
        throw new Error('Style option not found or not visible');
      }
      expect(box.height).toBe(36); // Fixed height for options
      
      // Hover state for each option
      await option.hover();
      await waitForAnimations(page);
      await expect(option).toHaveScreenshot(`style-option-${await option.textContent()}.png`, {
        maxDiffPixelRatio: 0.01
      });
    }
  });

  test('Responsive Behavior', async ({ page }) => {
    // Test mobile layout
    await page.setViewportSize({ width: 375, height: 667 });
    await waitForAnimations(page);
    
    // Check style button adaptation
    await expect(page.locator('[class*="styleButton"]')).toHaveScreenshot('style-button-mobile.png', {
      maxDiffPixelRatio: 0.01
    });

    // Check dropdown adaptation
    await page.click('[class*="styleButton"]');
    await waitForAnimations(page);
    await expect(page.locator('[class*="styleDropdown"]')).toHaveScreenshot('style-dropdown-mobile.png', {
      maxDiffPixelRatio: 0.01
    });
  });
}); 