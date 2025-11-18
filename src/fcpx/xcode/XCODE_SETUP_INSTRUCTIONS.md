# Xcode Project Setup Instructions

## Step 1: Create Xcode Project

1. **Open Xcode**
2. **File > New > Project**
3. Select **macOS > App**
4. Configure:
   - **Product Name**: `sync-fcpx-app`
   - **Team**: Your Apple Developer team
   - **Organization Identifier**: `com.sync.extension`
   - **Language**: **Swift**
   - **Interface**: **Storyboard** (or AppKit)
   - **Storage**: **None**
5. **Save** to: `src/fcpx/xcode/`

## Step 2: Add Workflow Extension Target

1. **File > New > Target**
2. Select **Final Cut Pro Workflow Extension** (under macOS > App Extension)
3. Configure:
   - **Product Name**: `sync-fcpx-extension`
   - **Embed in Application**: `sync-fcpx-app`
4. Click **Finish**

Xcode will create:
- `sync-fcpx-extension/ExtensionViewController.swift` (default template)
- `sync-fcpx-extension/Info.plist`
- `sync-fcpx-extension/Base.lproj/Main.storyboard`

## Step 3: Replace Extension Files

### Replace ExtensionViewController.swift

1. **Delete** the default `ExtensionViewController.swift` created by Xcode
2. **Copy** `src/fcpx/xcode/ExtensionViewController.swift` to the extension target
3. **Add to target**: Make sure it's added to `sync-fcpx-extension` target

### Update Info.plist

1. **Open** `sync-fcpx-extension/Info.plist`
2. **Replace** with contents from `src/fcpx/xcode/Info-Extension.plist`
3. **Important**: Update `NSExtensionPrincipalClass` to:
   ```
   $(PRODUCT_MODULE_NAME).ExtensionViewController
   ```

### Update App Info.plist

1. **Open** `sync-fcpx-app/Info.plist`
2. **Replace** with contents from `src/fcpx/xcode/Info-App.plist`

## Step 4: Add Additional Swift Files

Add these files to the **extension target**:

1. **HTTPBridge.swift** - Bridges to Node.js backend
2. **Bridge.swift** - Additional bridge utilities

**In Xcode**:
- Right-click extension target > Add Files to "sync-fcpx-extension"
- Select `HTTPBridge.swift` and `Bridge.swift`
- Make sure "Copy items if needed" is **unchecked** (files are already in place)
- Add to target: `sync-fcpx-extension` ✅

## Step 5: Link FinalCutPro Framework

1. **Select** `sync-fcpx-extension` target
2. **Build Phases** tab
3. **Link Binary With Libraries** section
4. Click **+** button
5. **Add Framework**:
   - Look for `FinalCutPro.framework` in:
     - `/Library/Frameworks/FinalCutPro.framework` (if SDK installed system-wide)
     - Or SDK installation directory (check SDK docs)
   - If not found, click **Add Other...** and browse to SDK location

## Step 6: Add UI Resources

1. **Build the project first** to create `dist/fcpx/`:
   ```bash
   FCPX_BUILD=true npm run build
   ```

2. **Run the build script**:
   ```bash
   bash src/fcpx/xcode/build-xcode-project.sh
   ```

3. **In Xcode**:
   - Right-click extension target > Add Files to "sync-fcpx-extension"
   - Navigate to `src/fcpx/xcode/sync-fcpx-extension/Resources/static/`
   - Select the `static` folder
   - **Options**:
     - ✅ Copy items if needed
     - ✅ Create folder references (not groups)
     - ✅ Add to target: `sync-fcpx-extension`

## Step 7: Configure Build Settings

### Extension Target (`sync-fcpx-extension`)

**General Tab**:
- Deployment Target: **macOS 10.15** or later
- Embed in Application: `sync-fcpx-app`

**Signing & Capabilities**:
- ✅ **App Sandbox** enabled
- Add capabilities:
  - ✅ **Outgoing Connections (Client)**
  - ✅ **User Selected File** (Read/Write)
  - ✅ **Network Client** (if needed)

**Build Settings**:
- **Swift Language Version**: Swift 5
- **Product Module Name**: `sync_fcpx_extension`
- **Framework Search Paths**: Add path to FinalCutPro.framework if needed

### App Target (`sync-fcpx-app`)

**Signing & Capabilities**:
- ✅ **App Sandbox** enabled
- ✅ **Hardened Runtime** enabled

## Step 8: Update Storyboard (Optional)

You can either:

**Option A: Use Storyboard** (default)
1. Open `Main.storyboard`
2. Set view controller class to `ExtensionViewController`
3. Add `WKWebView` to the view
4. Connect `webView` outlet

**Option B: Programmatic** (recommended)
1. Delete `Main.storyboard` reference
2. In `Info.plist`, remove `NSMainStoryboardFile` key
3. The code already creates WebView programmatically

## Step 9: Add Node.js Backend (Optional)

If you want to use the existing Node.js backend:

1. **Copy** `backend.js` to extension Resources:
   - Add `backend.js` to `sync-fcpx-extension/Resources/`
   - Make sure it's included in "Copy Bundle Resources"

2. **Add Node.js binary** (if bundling):
   - Copy Node.js binary to Resources
   - Or use system Node.js

## Step 10: Build and Test

1. **Build** (Cmd+B)
2. **Run** (Cmd+R) - This installs to `/Applications`
3. **Launch the app once**:
   ```bash
   open "/Applications/sync-fcpx-app.app"
   ```
4. **Open Final Cut Pro**
5. **Check Window > Extensions** - should see "sync."

## Troubleshooting

### Framework Not Found

- Check SDK installation location
- Add framework search path in Build Settings
- Verify framework is linked in "Link Binary With Libraries"

### Extension Doesn't Appear

- Make sure app is in `/Applications` (not `~/Applications`)
- Launch app once: `open "/Applications/sync-fcpx-app.app"`
- Restart Final Cut Pro
- Check Console.app for errors

### WebView Doesn't Load

- Verify `static` folder is in bundle
- Check file paths in `loadWebUI()`
- Try loading from dev server: `http://localhost:3001/main/`

### Build Errors

- Verify all Swift files are added to correct target
- Check that FinalCutPro.framework is linked
- Ensure deployment target is 10.15+

## Next Steps

Once the extension appears in FCPX:
- Test all NLE operations
- Integrate with existing HTTP backend
- Test timeline interactions
- Package for distribution

