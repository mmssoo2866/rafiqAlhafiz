# Fix Build and Installation Issues for Windows

The project is configured for a Linux-only environment (Replit) and uses `pnpm` with specific platform exclusions that prevent it from running on Windows. Additionally, the `preinstall` script in `package.json` uses Unix-specific commands that fail on Windows CMD/PowerShell.

## User Review Required

> [!IMPORTANT]
> - This plan involves installing `pnpm` globally on your system.
> - We will remove platform exclusions in `pnpm-workspace.yaml` that specifically disable Windows support for key build tools like `esbuild` and `rollup`.

## Proposed Changes

### Build Configuration

#### [MODIFY] [package.json](file:///C:/Users/1/Desktop/rafiqnew/rafiqnew/package.json)
- Remove the Unix-specific `preinstall` script or replace it with a cross-platform version using `node`.
- For simplicity, I'll recommend removing the strict enforcement or using a simple Node script.

#### [MODIFY] [pnpm-workspace.yaml](file:///C:/Users/1/Desktop/rafiqnew/rafiqnew/pnpm-workspace.yaml)
- Remove the `overrides` that exclude `win32` platforms. This is necessary to allow `pnpm` to install the correct binaries for your Windows system.

### Environment Setup
- Install `pnpm` globally: `npm install -g pnpm`
- Run `pnpm install` to set up the workspace.

## Verification Plan

### Automated Tests
- Run `pnpm --version` to verify installation.
- Run `pnpm install` to verify dependency resolution on Windows.
- Run `pnpm run build` to verify the build process.

### Manual Verification
- Verify that Capacitor commands (`npx cap add android`) work after dependencies are installed.
