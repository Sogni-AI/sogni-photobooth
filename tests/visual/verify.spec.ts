import { test } from '@playwright/test';
import { verifyComponentStates, verifyStyles } from '../helpers/component-test-utils';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Verify Component States', () => {
  let referenceStates: any;
  let referenceStyles: any;

  test.beforeAll(async () => {
    const referencePath = path.join(__dirname, '../__snapshots__/reference');
    
    // Load reference states
    referenceStates = {
      styleSelector: JSON.parse(
        fs.readFileSync(path.join(referencePath, 'style-selector-states.json'), 'utf8')
      ),
      dropdown: JSON.parse(
        fs.readFileSync(path.join(referencePath, 'dropdown-states.json'), 'utf8')
      ),
      option: JSON.parse(
        fs.readFileSync(path.join(referencePath, 'option-states.json'), 'utf8')
      )
    };

    // Load reference styles
    referenceStyles = JSON.parse(
      fs.readFileSync(path.join(referencePath, 'computed-styles.json'), 'utf8')
    );
  });

  test('verify style selector states', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify style selector states
    await verifyComponentStates(page, referenceStates.styleSelector, {
      selector: '.bottom-style-select',
      states: [
        { name: 'default' },
        { 
          name: 'hover',
          setup: async () => {
            await page.hover('.bottom-style-select');
            await page.waitForTimeout(300);
          }
        },
        {
          name: 'active',
          setup: async () => {
            await page.click('.bottom-style-select');
            await page.waitForTimeout(300);
          }
        }
      ]
    });

    // Verify dropdown states
    await verifyComponentStates(page, referenceStates.dropdown, {
      selector: '.style-dropdown',
      states: [
        {
          name: 'open',
          setup: async () => {
            await page.click('.bottom-style-select');
            await page.waitForTimeout(300);
          }
        }
      ]
    });

    // Verify dropdown option states
    await verifyComponentStates(page, referenceStates.option, {
      selector: '.style-option:first-child',
      states: [
        { name: 'default' },
        {
          name: 'hover',
          setup: async () => {
            await page.hover('.style-option:first-child');
            await page.waitForTimeout(300);
          }
        },
        {
          name: 'selected',
          setup: async () => {
            await page.click('.style-option:first-child');
            await page.waitForTimeout(300);
          }
        }
      ]
    });

    // Verify all computed styles
    await verifyStyles(page, referenceStyles, [
      '.bottom-style-select',
      '.style-dropdown',
      '.style-option',
      '.style-option.selected',
      '.header-config-btn'
    ]);
  });

  test('verify responsive behavior', async ({ page }) => {
    // Test mobile layout
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);

    // Verify style selector states in mobile
    await verifyComponentStates(page, referenceStates.styleSelector, {
      selector: '.bottom-style-select',
      states: [
        { name: 'default' },
        { 
          name: 'hover',
          setup: async () => {
            await page.hover('.bottom-style-select');
            await page.waitForTimeout(300);
          }
        }
      ]
    });

    // Verify dropdown in mobile
    await verifyComponentStates(page, referenceStates.dropdown, {
      selector: '.style-dropdown',
      states: [
        {
          name: 'open',
          setup: async () => {
            await page.click('.bottom-style-select');
            await page.waitForTimeout(300);
          }
        }
      ]
    });
  });

  test('verify interaction flows', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Test style selection flow
    await page.click('.bottom-style-select');
    await page.waitForTimeout(300);
    await verifyComponentStates(page, referenceStates.dropdown, {
      selector: '.style-dropdown',
      states: [{ name: 'open' }]
    });

    await page.click('.style-option:has-text("Random: All")');
    await page.waitForTimeout(300);
    await verifyComponentStates(page, referenceStates.styleSelector, {
      selector: '.bottom-style-select',
      states: [{ name: 'default' }]
    });

    // Test settings panel interaction
    await page.click('.header-config-btn');
    await page.waitForTimeout(300);
    await verifyStyles(page, referenceStyles, ['.control-overlay.visible']);

    // Test custom style flow
    await page.click('.style-option:has-text("Custom")');
    await page.waitForTimeout(300);
    await verifyStyles(page, referenceStyles, [
      '.control-overlay.visible',
      '.custom-style-input'
    ]);
  });
}); 