# Tab Synchronization Testing Guide

## Overview
The Photobooth application now includes multi-tab session management. When a logged-in user opens the app in a new tab, all previously open tabs will be cosmetically logged out with a session transfer message.

## Implementation Details

### Files Created/Modified

1. **`src/services/tabSync.ts`** (NEW)
   - Manages tab synchronization using BroadcastChannel API (with localStorage fallback)
   - Generates unique tab IDs for each browser tab
   - Notifies other tabs when a new authenticated session is detected

2. **`src/services/sogniAuth.ts`** (MODIFIED)
   - Added `cosmeticLogout()` method for UI-only logout (no API call)
   - Added `sessionTransferred` flag to auth state
   - Integrated with tabSync service to detect new tabs
   - Notifies other tabs when authentication occurs

3. **`src/components/auth/AuthStatus.tsx`** (MODIFIED)
   - Displays session transfer error modal
   - Provides "Refresh Browser" button for users to resume session

## How It Works

### Authentication Flow
1. User logs in on **Tab A** → Auth state updates → Tab sync broadcasts to other tabs
2. User opens **Tab B** and logs in OR refreshes → Tab sync broadcasts to other tabs
3. **Tab A** receives the broadcast → Triggers cosmetic logout → Shows error modal

### Error Message
> "Your Photobooth Session has been transferred to a new tab. Please refresh the browser to resume in this tab."

### Key Features
- **Cosmetic Logout**: Old tabs update UI to logged-out state WITHOUT calling logout API
- **Session Preservation**: User's actual session remains active (cookies/tokens intact)
- **Easy Recovery**: User can click "Refresh Browser" to resume in that tab
- **Cross-Browser Support**: Uses BroadcastChannel API with localStorage fallback

## Testing Instructions

### Manual Testing Steps

#### Test 1: New Tab After Login
1. Open the Photobooth app in **Tab 1**
2. Log in with valid credentials
3. Verify you're logged in (see username and balance)
4. Open the app in a **new tab (Tab 2)**
   - Can use: Cmd+T (Mac) / Ctrl+T (Windows) and navigate to app
   - Or: Right-click link → "Open in New Tab"
5. **Expected Result**: 
   - Tab 1 should immediately show the "Session Transferred" modal
   - Tab 2 should show you as logged in

#### Test 2: Refresh Existing Tab
1. Open app in **Tab 1** and log in
2. Open app in **Tab 2** (both logged in)
3. Refresh **Tab 2** (F5 or Cmd+R)
4. **Expected Result**:
   - Tab 1 shows "Session Transferred" modal
   - Tab 2 remains logged in after refresh

#### Test 3: Multiple Tabs
1. Open app in **Tab 1** and log in
2. Open app in **Tab 2** (Tab 1 logs out cosmetically)
3. Open app in **Tab 3** (Tab 1 and Tab 2 log out cosmetically)
4. **Expected Result**:
   - Only Tab 3 shows as logged in
   - Tab 1 and Tab 2 both show "Session Transferred" modal

#### Test 4: Recovery Flow
1. Open app in **Tab 1** and log in
2. Open app in **Tab 2** (Tab 1 logs out cosmetically)
3. In **Tab 1**, click "Refresh Browser" button on the modal
4. **Expected Result**:
   - Tab 1 refreshes and shows you as logged in
   - Tab 2 now shows "Session Transferred" modal

#### Test 5: Demo Mode
1. Open app in **Tab 1** and switch to Demo Mode
2. Open app in **Tab 2**
3. **Expected Result**:
   - Demo mode should NOT trigger session transfer
   - Both tabs can use demo mode independently

### Browser Console Testing

You can monitor the tab synchronization in the browser console:

1. Open Developer Tools (F12)
2. Go to Console tab
3. Look for log messages:
   - `🆔 Tab initialized with ID: tab_xxx`
   - `📢 Notified other tabs about new authenticated session`
   - `🚨 New authenticated tab detected`
   - `🔄 New authenticated tab detected, performing cosmetic logout`
   - `🎭 Performing cosmetic logout (UI only, no API call)`

### localStorage Inspection

Check the localStorage for tab session data:

1. Open Developer Tools (F12)
2. Go to Application tab (Chrome) or Storage tab (Firefox)
3. Look for: `sogni_active_tab_session`
4. Value should contain:
   ```json
   {
     "tabId": "tab_1730200000000_abc123",
     "timestamp": 1730200000000,
     "isAuthenticated": true
   }
   ```

## Edge Cases to Test

### Network Conditions
- ✅ **Offline**: Tab sync still works (uses localStorage fallback)
- ✅ **Slow connection**: Session transfer happens immediately (local storage)

### Browser Compatibility
- ✅ **Modern browsers** (Chrome, Firefox, Safari, Edge): Uses BroadcastChannel API
- ✅ **Older browsers**: Falls back to localStorage events

### Session States
- ✅ **Already logged out**: No session transfer occurs
- ✅ **Demo mode**: No session transfer (demo is local-only)
- ✅ **Login failure**: No session transfer (only on successful auth)

## Troubleshooting

### Issue: Session transfer not working
**Check**:
1. Are both tabs on the same origin? (session transfer only works within same domain)
2. Check browser console for errors
3. Verify localStorage is enabled
4. Check if BroadcastChannel is supported (should fall back to localStorage)

### Issue: Modal doesn't appear
**Check**:
1. Browser console for `sessionTransferred` flag
2. Verify `error` message is set in auth state
3. Check z-index conflicts (modal uses z-index: 100000)

### Issue: Can't refresh to resume
**Check**:
1. Cookies are enabled
2. Session is still valid on backend
3. No network errors preventing auth check

### Issue: Tab shows weird render or switches to demo mode (FIXED)
**What was happening**:
- Cosmetic logout triggered App's logout detection
- App automatically switched to demo mode
- UI showed transition state instead of session transfer modal

**Fix applied**:
- Added `sessionTransferred` check in App.jsx
- Skips demo mode switch when it's a cosmetic logout
- UI stays frozen in logged-in state while showing modal

## Technical Notes

### Why Cosmetic Logout?
- Preserves the user's session cookies/tokens
- Prevents unnecessary API calls
- Allows instant recovery via browser refresh
- Reduces server load

### Why Not Real Logout?
- Multiple tabs are a common user behavior
- User shouldn't lose session just because they opened a new tab
- Better UX: let user choose which tab to use

### Security Considerations
- Session tokens remain valid across all tabs
- Only UI state changes, not authentication state
- User can resume in any tab by refreshing

## Success Criteria

All tests pass if:
- ✅ Old tabs show "Session Transferred" modal when new tab opens
- ✅ Error message matches specification exactly
- ✅ Refresh button works to resume session
- ✅ No API logout calls are made on cosmetic logout
- ✅ Demo mode is unaffected
- ✅ Works in multiple browsers
- ✅ No JavaScript errors in console

