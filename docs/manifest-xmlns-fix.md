# Manifest.xml xmlns Fix Documentation

## Problem

ZXP installer was recognizing the extension as "other" instead of properly identifying it as supporting Premiere Pro (PPRO) and After Effects (AEFT).

## Root Cause

The `vite-cep-plugin` template was generating `manifest.xml` files **without** the required `xmlns` namespace attribute on the `<ExtensionManifest>` element.

### Original Template (vite-cep-plugin@2.1.1)

```xml
<ExtensionManifest
    Version="6.0" 
    ExtensionBundleId="com.example"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  >
```

**Missing:** `xmlns="http://ns.adobe.com/ExtensionManifest/6.0"`

### Fixed Template (After Patch)

```xml
<ExtensionManifest xmlns="http://ns.adobe.com/ExtensionManifest/6.0"
    Version="6.0"
    ExtensionBundleId="com.example"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  >
```

## Verification

1. **Original Template Confirmed Missing xmlns:**
   - Extracted original `vite-cep-plugin@2.1.1` package
   - Verified `manifest-template.js` does NOT include `xmlns="http://ns.adobe.com/ExtensionManifest/6.0"`
   - Only includes `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`

2. **Generated Manifest After Patch:**
   - Current `dist/cep/CSXS/manifest.xml` includes:
     ```xml
     <ExtensionManifest xmlns="http://ns.adobe.com/ExtensionManifest/6.0"
     Version="6.0"
     ...
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     ```

3. **XML Validity:**
   - Both with and without `xmlns` are valid XML
   - However, Adobe's ZXP installer requires the `xmlns` namespace for proper application recognition

## Solution

### Proper Fix Using patch-package

**Files:** 
- `patches/vite-cep-plugin+2.1.1.patch` - Patch file that fixes the manifest template
- `package.json` - Includes `postinstall` script to apply patches automatically

**Implementation:** Uses `patch-package` to patch the `vite-cep-plugin` package at the source, fixing the manifest template directly in the npm package.

### Implementation Details

1. **Package Patching:** The `vite-cep-plugin` package is patched using `patch-package` to fix the manifest template at the source
2. **Template Fix:** The `manifest-template.js` file in `node_modules/vite-cep-plugin/lib/templates/` is patched to include the `xmlns` attribute
3. **Namespace Format:** `xmlns="http://ns.adobe.com/ExtensionManifest/${extensionManifestVersion.toFixed(1)}"` dynamically uses the configured manifest version
4. **Automatic Application:** The `postinstall` script in `package.json` automatically applies the patch after `npm install`
5. **Proper Placement:** The `xmlns` attribute is added as the first attribute on the `<ExtensionManifest>` tag, before other attributes

### How It Works

1. **Patch Creation:** Modified `node_modules/vite-cep-plugin/lib/templates/manifest-template.js` to add the `xmlns` attribute
2. **Patch Generation:** Ran `npx patch-package vite-cep-plugin` to create `patches/vite-cep-plugin+2.1.1.patch`
3. **Automatic Application:** Added `"postinstall": "patch-package"` to `package.json` scripts so patches are applied automatically after `npm install`
4. **Result:** The manifest template now generates correct XML with the required namespace attribute from the start

## Testing

To verify the fix works:

1. Build ZXP: `npm run zxp`
2. Install the ZXP file
3. Check Adobe Extension Manager - should show "Premiere Pro" and "After Effects" instead of "other"

## References

- Adobe CEP Resources: https://github.com/Adobe-CEP/CEP-Resources
- vite-cep-plugin: https://www.npmjs.com/package/vite-cep-plugin

## Notes

- The `xmlns` namespace is required by Adobe's ZXP installer for proper application recognition
- The namespace format `http://ns.adobe.com/ExtensionManifest/{version}` follows Adobe's convention
- This fix uses `patch-package`, which is the standard approach for fixing npm packages without forking them
- The patch is version-specific (`vite-cep-plugin+2.1.1.patch`) and will need to be regenerated if the package version changes
- The patch is automatically applied after `npm install` via the `postinstall` script
- This is a proper fix at the source level, not a workaround or post-processing hack

