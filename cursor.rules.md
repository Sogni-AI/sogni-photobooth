# Cursor Rules for Sogni Photobooth

## 🚨🚨🚨 MANDATORY PRE-FLIGHT CHECK 🚨🚨🚨
**BEFORE making ANY changes to React components with useEffect:**

1. **READ** `USEEFFECT-CHECKLIST.md` - Complete the entire checklist
2. **RUN** `npm run validate:useeffect` - Must pass with 0 violations
3. **DOCUMENT** your useEffect with a comment explaining its single purpose
4. **COMMIT** only after validation passes

**If you skip these steps, you WILL introduce bugs that break the application.**

## CSS Specificity Rules
- **NEVER write redundant CSS selectors** - Use ONE selector with proper specificity, not multiple variations
- **Calculate CSS specificity properly**: IDs (100) > Classes (10) > Elements (1) > Universal (0)
- **Use the minimum specificity needed** to override existing rules
- **Avoid "nuclear option" selectors** with excessive redundancy like `html body div * .class, html body #root * .class`
- **One selector per rule** - if you need high specificity, use `html body #root .specific-class` (specificity: 112)

## 🚨🚨🚨 useEffect CRITICAL RULES - MANDATORY ENFORCEMENT 🚨🚨🚨

### 🎯 THE GOLDEN RULE: SINGLE RESPONSIBILITY PRINCIPLE
**Each useEffect should respond to ONE SPECIFIC CHANGE, not multiple unrelated things**

❌ **BAD** - Effect with multiple unrelated concerns:
```javascript
// This effect does TOO MUCH - it responds to auth changes AND setting changes
useEffect(() => {
  if (authState.isAuthenticated) {
    initClient();
    if (settings.watermark) {
      updateWatermark();
    }
  }
}, [authState.isAuthenticated, settings.watermark, initClient, updateWatermark]); // TOO MANY UNRELATED DEPENDENCIES!
```

✅ **GOOD** - Separate effects for separate concerns:
```javascript
// Auth effect - ONLY responds to auth changes
useEffect(() => {
  if (authState.isAuthenticated) {
    initClient();
  }
}, [authState.isAuthenticated]); // ONLY auth-related dependency

// Watermark effect - ONLY responds to watermark setting changes  
useEffect(() => {
  if (settings.watermark) {
    updateWatermark();
  }
}, [settings.watermark]); // ONLY watermark-related dependency
```

### 🚫 ABSOLUTE BAN LIST - NEVER IN DEPENDENCIES:
1. **Functions** - `initializeSogni`, `handleClick`, `updateSetting`, etc. ❌
2. **Context functions** - `updateSetting`, `clearCache`, `registerCallback` ❌
3. **Nested object properties** - `authState.getSogniClient()` ❌
4. **Arrays/Objects** - `settings`, `authState`, `config` (unless primitive extract) ❌
5. **Anything that's not directly related to when the effect should run** ❌

### ✅ ONLY ALLOWED IN DEPENDENCIES:
1. **Primitive values that should trigger this specific effect**
   - Example: `authState.isAuthenticated` for an auth effect ✅
   - Example: `settings.watermark` for a watermark effect ✅
2. **That's it. Nothing else.** ✅

### 🔧 MANDATORY PROCESS BEFORE ANY useEffect EDIT:

**STEP 1: What is this effect's SINGLE purpose?**
- "Handle auth state changes" → dependency: `authState.isAuthenticated`
- "Update watermark when setting changes" → dependency: `settings.watermark`  
- "Initialize on mount" → dependency: `[]`

**STEP 2: Remove ALL dependencies not directly related to that purpose**
- Is `initializeSogni` in the array? **DELETE IT** - reference it directly in effect body
- Is `updateSetting` in the array? **DELETE IT** - it's a stable function, doesn't need to be a dependency
- Is `settings` in array when you only care about `settings.watermark`? **DELETE IT** - extract the primitive

**STEP 3: Verify the dependency array**
- Count dependencies: More than 2-3? **SUSPICIOUS** - probably doing too much
- See any functions? **ERROR** - remove them immediately
- See any objects? **ERROR** - extract the primitive value you actually need

### 🔥 ENFORCEMENT CHECKLIST (MUST PASS ALL):
- [ ] Effect has ONE clear purpose (can be stated in one sentence)
- [ ] Dependency array has ≤ 3 items (if more, split into multiple effects)
- [ ] ZERO functions in dependency array
- [ ] ZERO objects in dependency array (extract primitives instead)
- [ ] ZERO context functions in dependency array (`updateSetting`, `clearCache`, etc.)
- [ ] Each dependency directly relates to when effect should run
- [ ] Can explain: "This effect runs when [dependency] changes because [reason]"

### 🚨 INSTANT REJECTION PATTERNS:
```javascript
// ❌ FORBIDDEN - Multiple unrelated dependencies
}, [authState.isAuthenticated, settings.watermark, updateSetting]);

// ❌ FORBIDDEN - Functions in dependencies  
}, [initializeSogni, handleClick]);

// ❌ FORBIDDEN - Context functions
}, [updateSetting, clearCache, registerCallback]);

// ❌ FORBIDDEN - Whole objects
}, [settings, authState, config]);

// ❌ FORBIDDEN - Mixed concerns
}, [isLoggedIn, selectedPhoto, apiEndpoint, theme]);

// ✅ CORRECT - Single primitive, single concern
}, [authState.isAuthenticated]);

// ✅ CORRECT - Two related primitives, single concern
}, [userId, sessionId]); // Both auth-related

// ✅ CORRECT - Empty for mount-only
}, []);
```

### 💡 HOW TO FIX COMMON VIOLATIONS:

**Problem:** "ESLint wants me to add `updateSetting` to dependencies"
**Solution:** Ignore ESLint - `updateSetting` is a stable context function, it won't change

**Problem:** "I need to call a function inside the effect"
**Solution:** Just call it - don't add it to dependencies. Functions don't need to be dependencies.

**Problem:** "Effect needs to respond to auth AND settings changes"  
**Solution:** Split into TWO effects - one for auth, one for settings

**Problem:** "I need the whole `settings` object"
**Solution:** Extract only the primitive values you need: `settings.watermark`, `settings.qrSize`, etc.

### 📊 EXAMPLES FROM THIS CODEBASE:

**❌ VIOLATION (from today's bug):**
```javascript
useEffect(() => {
  // Responds to auth changes...
  if (authState.isAuthenticated) { /* ... */ }
  // But also has settings.watermark in dependencies!
}, [authState.isAuthenticated, authState.authMode, initializeSogni, settings.sogniWatermark, updateSetting]);
// ^ Multiple unrelated concerns, functions in dependencies = BUG
```

**✅ CORRECT (after fix):**
```javascript
// Effect: Handle auth state changes (login/logout)
// Triggers when: User authentication status changes
useEffect(() => {
  // ONLY responds to auth changes
  if (authState.isAuthenticated) { 
    // Call initializeSogni directly - no need to add to dependencies
    initializeSogni();
  }
}, [authState.isAuthenticated, authState.authMode]);
// ^ Only auth-related primitives, no functions = NO BUG
```

### 🔧 AUTOMATED VALIDATION

**Run this before committing:**
```bash
npm run validate:useeffect
```

This script will **automatically catch** violations and **prevent commits** with bad useEffect patterns.

Current violations in codebase: Run the script to see them.

**Your job:** Fix ALL violations before making new changes. Don't add to the problem.

## 🚨🚨🚨 LOCAL DEVELOPMENT RULES - CRITICAL 🚨🚨🚨
### ❌ NEVER TEST WITH THESE:
- `http://localhost:3001` ❌
- `http://localhost:5173` ❌  
- `http://localhost:5175` ❌
- `http://127.0.0.1:3001` ❌

### ✅ ALWAYS TEST WITH THESE:
- **Frontend**: `https://photobooth-local.sogni.ai` ✅
- **Backend API**: `https://photobooth-api-local.sogni.ai` ✅
- **Use `-k` flag with curl** for self-signed certificates ✅

### 🔧 WHY THIS MATTERS:
- **CORS** - Server only allows sogni.ai origins
- **Cookies** - Set for `.sogni.ai` domain only
- **OAuth** - Twitter/X OAuth uses sogni.ai redirects
- **SSL/TLS** - Local uses HTTPS with self-signed certs
- **Nginx** - Routes through nginx configuration

### 📝 TESTING EXAMPLES:
```bash
# Test Halloween meta tags (CORRECT)
curl -k -s https://photobooth-local.sogni.ai/halloween | grep "og:"

# Test API health (CORRECT)  
curl -k https://photobooth-api-local.sogni.ai/health

# WRONG - Don't use localhost
curl http://localhost:3001/halloween  # ❌ WILL FAIL
```

### 🚦 OTHER ENVIRONMENT RULES:
- **Terminal instances**: NEVER spawn new terminal instances - the application is already running externally to Cursor
- **Server management**: Do NOT use `npm run dev` or start/stop servers - they're managed outside Cursor
- **Testing**: Use the live local development URL for testing changes

## Architecture & Concurrent Processing Rules 🏗️
- **🔥 CRITICAL: ONE SDK INSTANCE PER BACKEND** - All clients hitting the same Photobooth Backend share the same global SDK instance
- **🚨 NEVER CONCLUDE SOGNI SDK IS SEQUENTIAL** - It fully supports concurrent projects! Main frontend proves this with 16+ concurrent jobs
- **ALWAYS reference ARCHITECTURE-ROADMAP.md** before making concurrent processing changes
- **NEVER create multiple Sogni SDK instances** for same application/client - main photobooth uses single global instance for ALL operations
- **NEVER create multiple clientAppIds** for concurrent projects - use single shared clientAppId per application/client
- **ALWAYS reuse existing SDK instance** instead of creating new ones for same appId
- **ALWAYS follow the main frontend pattern** for concurrent handling - it's the proven working implementation
- **ALWAYS check for `code: 4015` errors** when debugging concurrent issues (indicates multiple SDK instances conflict)
- **ALWAYS check for "Invalid nonce" errors** when debugging concurrent issues (indicates concurrent SDK creation)

## Debugging & Problem Solving Rules 🔍
- **🚨 CRITICAL: VALIDATE ALL ASSUMPTIONS WITH ACTUAL CODE** - Never make conclusions without examining the source code
- **ALWAYS examine the actual implementation** - Look at the code in node_modules, source files, etc. before concluding anything
- **NEVER assume limitations exist** - Prove limitations by finding them in the actual code
- **ALWAYS add logging to prove/disprove theories** - Instrument the actual code to see what's happening
- **ALWAYS start with symptoms** - analyze error messages, console logs, and network requests FIRST
- **NEVER assume root cause** - trace the actual code execution path before making changes
- **ALWAYS ask for browser dev tools info** when debugging UI issues (console, network tab, elements)
- **ONE hypothesis at a time** - test each theory with minimal changes before moving to next
- **ALWAYS verify the fix** - ensure the change actually resolves the reported issue
- **NEVER apply multiple "solutions"** without confirming each one works
- **ALWAYS trace data flow** - follow variables from creation to usage when debugging
- **STOP and ask for clarification** if symptoms don't match expected behavior
- **ALWAYS check ARCHITECTURE-ROADMAP.md** for known patterns and pitfalls before debugging concurrent issues

## 📚 Key Reference Documents
- **`ARCHITECTURE-ROADMAP.md`** - Authoritative guide for concurrent processing, SSE patterns, and architectural decisions
- **`server/services/sogni.js`** - Core SDK instance management and concurrent project handling
- **`server/routes/sogni.js`** - SSE endpoint routing and event forwarding logic

## General Rules
- You may ask me follow up questions until you are at least 95% certain you can complete the task well and then continue.
- Never rewrite or delete files unless I explicitly ask or it's obvious I want files changed.
- If a change breaks TypeScript / ESLint / tests, fix it.
- When refactoring, move only one logical unit (component / hook / util) per step.
- Preserve import paths & CSS class names exactly.
- Always use 2 space soft tabs. Check and enforce all project lint rules against new code like no-trailing-spaces.
- **Always check CSS specificity when editing CSS** - use proper specificity calculations, not redundant selectors.