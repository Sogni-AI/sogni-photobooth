# Chrome Web Store Submission Guide - Sogni Vibe Explorer

## Prerequisites

### 1. Google Developer Account
- **Cost**: $5 one-time registration fee
- **Setup**: Go to [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole)
- **Payment**: You'll need a credit card for the registration fee
- **Verification**: Google may require identity verification

### 2. Required Assets
✅ **Extension Package**: `sogni-style-explorer-v1.1.0.zip` (already created)
✅ **Store Listing Content**: `CHROME_STORE_LISTING.md` (already created)
🔲 **Screenshots**: Need 5 high-quality screenshots (1280x800 or 640x400)
🔲 **Icon**: 128x128 PNG (already have in icons folder)
🔲 **Privacy Policy**: Must be hosted at a public URL
🔲 **Promotional Images** (optional): 440x280, 920x680, 1400x560

## Step-by-Step Submission Process

### Phase 1: Prepare Assets (Do This First)

#### 1. Take Screenshots
You need to take 5 screenshots showing:
1. **Vibe Explorer Interface**: The overlay with style grid
2. **Before/After Comparison**: Original vs transformed photos
3. **Real Website Usage**: Extension working on a conference site
4. **Style Selection**: Close-up of choosing a style
5. **Transformation Progress**: Real-time progress indicators

**Screenshot Requirements**:
- Size: 1280x800 pixels (recommended) or 640x400 pixels (minimum)
- Format: PNG or JPEG
- Quality: High resolution, clear text
- No browser chrome (just the webpage content)

#### 2. Create Privacy Policy
- **Required**: Chrome Web Store requires a privacy policy for extensions that handle user data
- **Host Location**: Must be publicly accessible (suggest: `https://photobooth.sogni.ai/privacy`)
- **Content**: Should cover data collection, usage, and storage practices

#### 3. Prepare Promotional Images (Optional but Recommended)
- **Small Tile**: 440x280 pixels
- **Large Tile**: 920x680 pixels  
- **Marquee**: 1400x560 pixels
- These help with discoverability in the Chrome Web Store

### Phase 2: Developer Console Setup

#### 1. Register as Chrome Web Store Developer
1. Go to [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole)
2. Sign in with your Google account
3. Pay the $5 registration fee
4. Complete any required verification steps

#### 2. Create New Item
1. Click "Add new item"
2. Upload `sogni-style-explorer-v1.1.0.zip`
3. Wait for the package to be processed and validated

### Phase 3: Store Listing Configuration

#### 1. Basic Information
- **Name**: Sogni Vibe Explorer
- **Summary**: Transform profile photos with hundreds of AI styles using Sogni Photobooth's cutting-edge AI technology.
- **Category**: Productivity
- **Language**: English

#### 2. Detailed Description
Copy the detailed description from `CHROME_STORE_LISTING.md`

#### 3. Privacy Practices
- **Single Purpose**: Transform profile photos using AI artistic styles
- **Permission Justification**: Use the justifications from `CHROME_STORE_LISTING.md`
- **Privacy Policy**: Link to your hosted privacy policy
- **Data Usage**: Declare what data is collected and how it's used

#### 4. Store Listing Assets
- **Icon**: Upload the 128x128 icon from `icons/icon128.png`
- **Screenshots**: Upload your 5 screenshots
- **Promotional Images**: Upload if you created them

#### 5. Distribution Settings
- **Visibility**: Public (for general availability)
- **Regions**: All regions (or select specific countries)
- **Pricing**: Free

### Phase 4: Review and Publish

#### 1. Review Process
- **Initial Review**: Usually takes 1-3 business days
- **Possible Outcomes**:
  - ✅ **Approved**: Extension goes live immediately
  - ❌ **Rejected**: You'll receive feedback on what needs to be fixed
  - ⏳ **Additional Review**: May take up to 7 days for complex extensions

#### 2. Common Rejection Reasons (and How to Avoid Them)
- **Permissions**: Ensure all permissions are justified and necessary
- **Privacy Policy**: Must be accessible and comprehensive
- **Functionality**: Extension must work as described
- **Content Policy**: Must comply with Chrome Web Store policies
- **Spam**: Avoid keyword stuffing in descriptions

### Phase 5: Post-Publication

#### 1. Unlisted Beta Testing (Recommended First Step)
Before going fully public, consider:
1. Set visibility to "Unlisted" initially
2. Share the extension link with beta testers
3. Gather feedback and fix any issues
4. Change to "Public" once you're confident

#### 2. Monitoring and Updates
- **Analytics**: Monitor installation and usage stats
- **User Feedback**: Respond to reviews and support requests
- **Updates**: Use the same process to publish updates

## Beta Testing Setup (Recommended)

### Option 1: Unlisted Extension
1. Follow the full submission process above
2. Set visibility to "Unlisted" instead of "Public"
3. Share the Chrome Web Store URL with beta testers
4. Change to "Public" when ready

### Option 2: Developer Mode Testing
1. Share the `browser-extension-production` folder with testers
2. Testers enable "Developer mode" in Chrome extensions
3. Use "Load unpacked" to install the extension
4. Gather feedback before submitting to store

## Important Notes

### Content Policy Compliance
- ✅ Extension serves a clear, single purpose
- ✅ No misleading functionality
- ✅ Respects user privacy
- ✅ No spam or keyword stuffing
- ✅ Professional presentation

### Technical Requirements
- ✅ Manifest V3 compliant
- ✅ All permissions justified
- ✅ No security vulnerabilities
- ✅ Works as described
- ✅ Handles errors gracefully

### Timeline Expectations
- **Registration**: Immediate (after payment)
- **Package Upload**: 5-10 minutes
- **Initial Review**: 1-3 business days
- **Extended Review**: Up to 7 days (if needed)
- **Rejection Fixes**: Start the review process over

## Next Steps for You

1. **Take Screenshots**: Use the extension on real websites to capture the 5 required screenshots
2. **Create Privacy Policy**: Host a privacy policy at `https://photobooth.sogni.ai/privacy`
3. **Register Developer Account**: Pay the $5 fee and set up your account
4. **Start with Unlisted**: Consider launching as unlisted first for beta testing
5. **Submit for Review**: Upload the extension and complete the store listing

## Support and Resources

- **Chrome Web Store Developer Documentation**: https://developer.chrome.com/docs/webstore/
- **Chrome Extension Development Guide**: https://developer.chrome.com/docs/extensions/
- **Content Policy**: https://developer.chrome.com/docs/webstore/program-policies/
- **Review Process**: https://developer.chrome.com/docs/webstore/review-process/

## Files Ready for Submission

✅ `sogni-style-explorer-v1.1.0.zip` - Extension package
✅ `CHROME_STORE_LISTING.md` - Store listing content  
✅ `icons/icon128.png` - Store icon
✅ Extension is configured for production endpoints
✅ Version number updated to 1.1.0
✅ Development features removed

**Still needed**:
- Screenshots (5 required)
- Privacy policy (hosted publicly)
- Developer account registration
- Optional promotional images
