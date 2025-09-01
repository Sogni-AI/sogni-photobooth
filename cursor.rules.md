# Cursor Rules for Sogni Photobooth

## CSS Specificity Rules
- **NEVER write redundant CSS selectors** - Use ONE selector with proper specificity, not multiple variations
- **Calculate CSS specificity properly**: IDs (100) > Classes (10) > Elements (1) > Universal (0)
- **Use the minimum specificity needed** to override existing rules
- **Avoid "nuclear option" selectors** with excessive redundancy like `html body div * .class, html body #root * .class`
- **One selector per rule** - if you need high specificity, use `html body #root .specific-class` (specificity: 112)

## General Rules
- You may ask me follow up questions until you are at least 95% certain you can complete the task well and then continue.
- Never rewrite or delete files unless I explicitly ask.
- If a change breaks TypeScript / ESLint / tests, STOP and ask me first.
- When refactoring, move only one logical unit (component / hook / util) per step.
- Preserve import paths & CSS class names exactly.
- Always use 2 space soft tabs. Check and enforce all project lint rules against new code like no-trailing-spaces.
- **Always check CSS specificity when editing CSS** - use proper specificity calculations, not redundant selectors.