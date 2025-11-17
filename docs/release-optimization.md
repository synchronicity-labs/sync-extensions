# Release Optimization Guide

## Current File Sizes

- **ZXP**: ~273MB (29,378 files)
- **ZIP**: ~552MB (30,875 files)

## Size Breakdown

### Major Contributors

1. **Node.js Binaries**: ~260MB
   - `bin/darwin-arm64/node`: ~93MB
   - `bin/darwin-x64/node`: ~98MB  
   - `bin/win32-x64/node.exe`: ~69MB

2. **server/node_modules**: ~200-300MB
   - All production dependencies
   - Includes large packages like:
     - `sharp` (image processing)
     - `@aws-sdk/client-s3` (AWS SDK)
     - `@xenova/transformers` (ML models)
     - `tesseract.js` (OCR)
     - `exiftool-vendored` (metadata)

3. **Built Assets**: ~50-100MB
   - Compiled JavaScript bundles
   - CSS files
   - Assets and icons

## Optimization Strategies

### 1. **Use Platform-Specific Builds** (Biggest Impact)

Instead of bundling Node.js binaries for all platforms in every release:

**Option A: Separate Platform Releases**
- Create separate releases: `v0.9.50-macos-arm64`, `v0.9.50-macos-x64`, `v0.9.50-windows`
- Each includes only the relevant Node.js binary
- **Savings**: ~180MB per release (60% reduction)

**Option B: Download Node.js on First Run**
- Don't bundle Node.js binaries
- Download the appropriate binary on first launch
- Cache it locally for future runs
- **Savings**: ~260MB (95% reduction for binaries)

**Option C: Use System Node.js**
- Require users to have Node.js installed
- Only bundle if not found (fallback)
- **Savings**: ~260MB (if system Node available)

### 2. **Optimize Dependencies**

**Remove Unused Dependencies**
```bash
# Audit dependencies
npm ls --depth=0
npm audit

# Check for duplicates
npm dedupe
```

**Use Lighter Alternatives**
- Replace `sharp` with lighter image processing (if possible)
- Consider lazy-loading ML models (`@xenova/transformers`)
- Use CDN for large libraries where possible

**Tree-Shaking**
- Ensure production builds use tree-shaking
- Remove unused code from bundles

### 3. **Compress More Aggressively**

**ZXP Files**
- ZXP is already a ZIP archive, but we can:
  - Use better compression levels
  - Remove unnecessary files before packaging

**Remove Development Files**
- Remove `.map` files (source maps)
- Remove test files
- Remove documentation files
- Remove TypeScript source files (already compiled)

### 4. **Split Server Dependencies**

**Core vs Optional**
- Split dependencies into:
  - Core: Required for basic functionality
  - Optional: Download on-demand (ML models, advanced features)

**Lazy Loading**
- Load heavy dependencies only when needed
- Download large packages on first use

### 5. **Simplify Release Process**

**Current Issues:**
- Can't commit files >100MB to git
- GitHub Actions workflow expects files in repo
- Manual release creation needed

**Solution: Use `gh release create` Directly**

Update `bin/release.sh` to:
1. Build packages locally
2. Push tag (without large files)
3. Use `gh release create` to upload files directly
4. This bypasses git's 100MB limit

**Example:**
```bash
# After building and tagging
gh release create "v$VERSION" \
  dist/zxp/com.sync.extension.zxp \
  "dist/sync-resolve-plugin-v${VERSION}.zip" \
  --title "Release v${VERSION}" \
  --notes "$MESSAGE"
```

## Recommended Approach

### Short Term (Quick Wins)
1. ✅ Update release script to use `gh release create` directly
2. ✅ Remove source maps from production builds
3. ✅ Remove unnecessary files before packaging

### Medium Term (Significant Reduction)
1. **Platform-specific releases**: Create separate releases per platform
   - Reduces each release by ~60%
   - Users download only what they need
2. **Optimize dependencies**: Audit and remove unused packages
3. **Better compression**: Use higher compression levels

### Long Term (Maximum Optimization)
1. **Download Node.js on demand**: Don't bundle binaries
2. **Lazy-load heavy dependencies**: Download ML models, etc. on first use
3. **Split into core + extensions**: Core package + optional feature packages

## Implementation Priority

1. **High Priority**: Fix release script (use `gh release create`)
2. **High Priority**: Platform-specific releases
3. **Medium Priority**: Dependency optimization
4. **Low Priority**: Lazy loading (requires code changes)

## File Size Targets

- **Current**: 273MB ZXP, 552MB ZIP
- **Short-term goal**: <200MB per platform release
- **Long-term goal**: <100MB per platform release

## Release Script Improvements

The release script should:
1. Build packages
2. Create platform-specific variants (optional)
3. Push tag (without large files)
4. Upload files directly via `gh release create`
5. Handle upload failures gracefully
6. Provide progress feedback for large uploads

