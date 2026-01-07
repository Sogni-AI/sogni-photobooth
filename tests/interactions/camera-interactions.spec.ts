import { test, expect } from '@playwright/test';
import {
  waitForCamera,
  openSettings,
  selectStyle,
  verifyVisible,
  mockCameraPermissions,
  cleanup,
  waitForStableState,
  TEST_SERVER_URL
} from '../helpers/test-utils';

// IMPORTANT: Always use the dedicated test server (port 5176)
// Main dev server runs on port 5175 and should not be used for tests
test.describe('Camera Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await mockCameraPermissions(page);
    await page.goto(TEST_SERVER_URL);
    await waitForCamera(page);
    await waitForStableState(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup(page);
  });

  test('style selector opens and changes styles', async ({ page }) => {
    await selectStyle(page, 'Anime');
    await waitForStableState(page);
    const styleText = await page.textContent('.bottom-style-select');
    expect(styleText).toContain('Anime');
  });

  test('settings panel controls work', async ({ page }) => {
    await openSettings(page);
    await waitForStableState(page);

    // Test number of images slider
    const slider = page.locator('input[type="range"]').first();
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = '32';
      el.dispatchEvent(new Event('change'));
    });
    await waitForStableState(page);
    
    // Verify value updated
    const value = await page.textContent('.slider-value');
    expect(value).toBe('32');

    // Test model selection
    await page.selectOption('.model-select', 'coreml-sogniXLturbo_alpha1_ad');
    await waitForStableState(page);
    
    // Toggle flash
    await page.click('#flash-toggle');
    await waitForStableState(page);
    
    // Verify changes persist after closing/reopening
    await page.click('.dismiss-overlay-btn');
    await waitForStableState(page);
    await openSettings(page);
    await waitForStableState(page);
    
    const flashToggle = await page.isChecked('#flash-toggle');
    expect(flashToggle).toBe(true);
  });

  test('photo capture workflow', async ({ page }) => {
    // Start photo capture
    await page.click('.camera-shutter-btn');
    
    // Verify countdown appears
    await verifyVisible(page, '.global-countdown-overlay');
    
    // Wait for countdown and flash
    await page.waitForTimeout(3500);
    
    // Verify flash appears (if enabled)
    await verifyVisible(page, '.flash-overlay');
    await waitForStableState(page);
    
    // Verify transition to photo grid
    await verifyVisible(page, '.film-strip-container');
    
    // Verify at least one photo frame appears
    await verifyVisible(page, '.film-frame');
  });

  test('camera device selection', async ({ page }) => {
    await openSettings(page);
    await waitForStableState(page);
    
    // Check if multiple cameras available
    const cameraSelect = page.locator('.camera-select');
    const hasMultipleCameras = await cameraSelect.count() > 0;
    
    if (hasMultipleCameras) {
      // Select different camera
      await cameraSelect.selectOption({ index: 1 });
      await waitForStableState(page);
      
      // Verify camera stream remains active
      await verifyVisible(page, 'video#webcam');
    }
  });

  test('drag and drop photo upload', async ({ page }) => {
    // Create a mock file
    await page.evaluate(() => {
      const mockFile = new File([''], 'test.png', { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(mockFile);
      
      // Dispatch drag events
      const dropZone = document.querySelector('.photobooth-app');
      if (dropZone) {
        dropZone.dispatchEvent(new DragEvent('dragenter', { dataTransfer }));
        dropZone.dispatchEvent(new DragEvent('drop', { dataTransfer }));
      }
    });
    
    await waitForStableState(page);
    // Verify upload triggers photo generation
    await verifyVisible(page, '.film-strip-container');
  });

  test('positive prompt auto-switches style picker', async ({ page }) => {
    // Open settings
    await openSettings(page);
    await waitForStableState(page);

    // Select a specific style (not custom or randomMix)
    await selectStyle(page, 'Anime');
    await waitForStableState(page);

    // Find and type in the positive prompt field
    const positivePromptField = page.locator('textarea.custom-style-input').first();
    await positivePromptField.fill('');
    await positivePromptField.fill('a beautiful sunset over mountains');
    await waitForStableState(page);

    // Verify that selectedStyle switched to 'custom'
    const selectedStyle = await page.evaluate(() => {
      const settings = localStorage.getItem('sogni_settings');
      return settings ? JSON.parse(settings).selectedStyle : null;
    });
    expect(selectedStyle).toBe('custom');

    // Now clear the positive prompt field completely
    await positivePromptField.fill('');
    await waitForStableState(page);

    // Verify that selectedStyle switched to 'randomMix'
    const selectedStyleAfterClear = await page.evaluate(() => {
      const settings = localStorage.getItem('sogni_settings');
      return settings ? JSON.parse(settings).selectedStyle : null;
    });
    expect(selectedStyleAfterClear).toBe('randomMix');
  });
}); 