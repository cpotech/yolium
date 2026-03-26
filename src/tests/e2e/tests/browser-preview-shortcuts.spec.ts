/**
 * @module src/tests/e2e/tests/browser-preview-shortcuts.spec
 *
 * E2E tests for browser preview panel keyboard shortcuts.
 * Tests Space+b toggle, browser-focused mode shortcuts (r, h, l, u, Escape),
 * and hint bar updates.
 */

import { test, expect } from '@playwright/test'
import { launchApp, closeApp, createTestRepo, cleanupTestRepo, type AppContext } from '../helpers/app'
import { selectors } from '../helpers/selectors'
import * as os from 'os'

let ctx: AppContext
let testRepoPath: string

test.beforeAll(async () => {
  testRepoPath = await createTestRepo(os.tmpdir())
})

test.afterAll(async () => {
  await cleanupTestRepo(testRepoPath)
})

test.beforeEach(async () => {
  ctx = await launchApp()
})

test.afterEach(async () => {
  await closeApp(ctx)
})

/**
 * Open a kanban board and create a work item, then open its detail dialog.
 */
async function openItemDetailDialog(context: AppContext, repoPath: string): Promise<void> {
  const page = context.window

  // Add project via sidebar
  const addButton = page.locator(selectors.openProjectButton)
  await addButton.click()
  await page.waitForSelector(selectors.pathDialog)
  await page.fill(selectors.pathInput, repoPath)
  await page.click(selectors.pathNextButton)

  // Wait for kanban to appear
  await page.waitForSelector(selectors.kanbanView, { timeout: 15000 })

  // Create a new item
  await page.keyboard.press('n')
  await page.waitForSelector(selectors.newItemDialog)
  await page.fill(selectors.newItemTitle, 'Test browser preview')
  await page.click(selectors.newItemCreate)

  // Wait for board to update and open the item
  await page.waitForTimeout(500)
  await page.keyboard.press('Escape') // back to normal mode
  await page.keyboard.press('c') // focus content
  await page.keyboard.press('Enter') // open card
  await page.waitForSelector(selectors.itemDetailDialog, { timeout: 5000 })
}

test.describe('Browser Preview Shortcuts', () => {
  test('Space+b should toggle browser preview panel visibility', async () => {
    await openItemDetailDialog(ctx, testRepoPath)
    const page = ctx.window

    // Ensure we're in NORMAL mode
    await page.keyboard.press('Escape')

    // Panel should not exist initially
    let panel = await page.$(selectors.browserPreviewPanel)
    expect(panel).toBeNull()

    // Space+b to open
    await page.keyboard.press('Space')
    await page.keyboard.press('b')
    panel = await page.$(selectors.browserPreviewPanel)
    expect(panel).not.toBeNull()

    // Space+b again to close (need to exit browser focus first)
    await page.keyboard.press('Escape') // exit browser focus
    await page.keyboard.press('Space')
    await page.keyboard.press('b')
    panel = await page.$(selectors.browserPreviewPanel)
    expect(panel).toBeNull()
  })

  test('Space+b should show empty state when no container is associated', async () => {
    await openItemDetailDialog(ctx, testRepoPath)
    const page = ctx.window

    await page.keyboard.press('Escape')

    // Space+b opens the panel (shows empty state when no container)
    await page.keyboard.press('Space')
    await page.keyboard.press('b')

    const panel = await page.$(selectors.browserPreviewPanel)
    expect(panel).not.toBeNull()

    // Should show empty state since there's no container
    const emptyState = await page.$(selectors.browserEmptyState)
    expect(emptyState).not.toBeNull()
  })

  test('Escape should exit browser focus mode, not close panel', async () => {
    await openItemDetailDialog(ctx, testRepoPath)
    const page = ctx.window

    await page.keyboard.press('Escape')

    // Open browser panel
    await page.keyboard.press('Space')
    await page.keyboard.press('b')

    // Panel should be visible
    let panel = await page.$(selectors.browserPreviewPanel)
    expect(panel).not.toBeNull()

    // Escape exits browser focus mode but doesn't close panel
    await page.keyboard.press('Escape')
    panel = await page.$(selectors.browserPreviewPanel)
    expect(panel).not.toBeNull()
  })

  test('shortcuts hint bar should show browser shortcuts when panel is open', async () => {
    await openItemDetailDialog(ctx, testRepoPath)
    const page = ctx.window

    await page.keyboard.press('Escape')

    // Open browser panel (enters browser focused mode)
    await page.keyboard.press('Space')
    await page.keyboard.press('b')

    // Check hint bar shows browser shortcuts
    const hintBar = page.locator(selectors.shortcutsHintBar)
    const hintText = await hintBar.textContent()
    expect(hintText).toContain('Reload')
    expect(hintText).toContain('Back')
  })
})
