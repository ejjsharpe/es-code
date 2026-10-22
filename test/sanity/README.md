# VS Code Release Sanity Check Tests

## Overview

Automated end-to-end release sanity tests for published VS Code builds.
These tests verify critical functionality across different platforms and installation methods,
ensuring that published builds meet quality standards before reaching end users.

See [Sanity Check wiki page](https://github.com/microsoft/vscode/wiki/Sanity-Check) for more details on sanity testing.

## Usage

Many tests will use the underlying platform to install and verify basic VS Code functionality.
Such tests will need to be run on the corresponding target OS/virtual machine and will fail if ran outside.
Use -g or -f command-line options to filter tests to match the host platform.

### Command-Line Options

|Option|Alias|Description|
|--------|-------|-------------|
|`--commit <commit>`|`-c`|The commit to test (required)|
|`--quality <quality>`|`-q`|The quality to test (required, "stable", "insider" or "exploration")|
|`--no-cleanup`||Do not cleanup downloaded files after each test|
|`--no-signing-check`||Skip Authenticode and codesign signature checks|
|`--no-headless`||Run tests with a visible UI (desktop tests only)|
|`--no-detection`||Enable all tests regardless of platform and skip executable runs|
|`--grep <pattern>`|`-g`|Only run tests matching the given pattern (Mocha grep)|
|`--fgrep <string>`|`-f`|Only run tests containing the given string (Mocha fgrep)|
|`--test-results <path>`|`-t`|Output test results in JUnit format to the specified path|
|`--timeout <sec>`||Set the test-case timeout in seconds (default: 600 seconds)|
|`--artifacts-dir <path>`||Resolve builds from downloaded pipeline artifacts instead of the update service|
|`--setuid-sandbox`||Launch installed DEB/RPM desktop apps with the namespace sandbox disabled; requires a non-root runner and a root owned `4755` sandbox helper|
|`--verbose`|`-v`|Enable verbose logging|
|`--help`|`-h`|Show this help message|

### Example

To run CLI tests for all platforms on given commit of Insiders build, from the root directory run:

```bash
npm run sanity-test -- --commit 19228f26df517fecbfda96c20956f7c521e072be --quality insider -g "cli*"
```

### Testing Unpublished Builds

By default targets are resolved through `update.code.visualstudio.com`, which only serves published
builds. Validation builds that never publish — such as the Copilot SDK canary runs — can be tested by
passing `--artifacts-dir`, which resolves each target from downloaded build pipeline artifacts laid out
as `<artifacts-dir>/<artifact-name>/<file>`:

```bash
npm run sanity-test -- --commit <commit> --quality insider --artifacts-dir /tmp/artifacts -g "linux.*x64"
```

Every target has a `targetArtifacts` mapping in `src/context.ts`; an unmapped target fails with an
explicit error rather than falling back to the update service, so runs must be scoped with `-g`/`-f`
to the artifacts that were actually downloaded. The SHA-256 check is skipped in this mode because
there is no update service metadata to compare against.

### Timeouts

The UI tests open a Markdown preview and wait up to one minute for its webview to render, then up to one minute for its document to finish loading. Resource monitoring remains active through document loading so delayed script failures are also detected. This catches webview resource loading failures (for example 401 responses for remote authorities with uppercase letters such as `wsl+Ubuntu`), and any webview resource response with an error status fails the test. Browsers that refuse to register the webview service worker (such as Chromium on Debian 12) cannot load any webview, so the check is skipped there with a pipeline warning.

Synchronous `wsl` commands issued by the tests, and the Ubuntu import, startup, conversion and listing commands in the Windows setup script, have a five-minute timeout. The setup wrapper normalizes nonzero exit codes (including `-1`) to `1` so batch error checks detect them. Setup emits a pipeline warning when Ubuntu cannot run; this does not install a missing WSL2 kernel or re-enable unavailable WSL coverage.

Extension installation makes at most three attempts, each allowing 30 seconds to click Install, 30 seconds for installation to start, and one minute to wait for completion, with a five-second delay between attempts. These waits total at most 6 minutes 10 seconds, leaving room for setup, the Markdown preview check and cleanup within the default ten-minute test timeout. Mocha does not cancel timed-out async tests, so increasing these waits can cause a retry to start before the previous attempt has cleaned up.

## Scripts

Platform-specific scripts are provided in the `scripts/` directory to set up the environment and run tests:

|Script|Platform|Description|
|--------|----------|-------------|
|`run-win32.cmd`|Windows|Runs tests using Edge as the Playwright browser|
|`run-macOS.sh`|macOS|Installs Playwright WebKit and runs tests|
|`run-ubuntu.sh`|Ubuntu|Sets up X11, Chromium, and Snap daemon, then runs tests|
|`run-docker.sh`|Linux (Docker)|Pulls a prebuilt image and runs tests inside a Docker container|
|`run-docker.cmd`|Windows (Docker)|Windows wrapper for Docker-based Linux tests|

### Docker Script Options

The `run-docker.sh` script accepts the following options:

|Option|Description|
|--------|-------------|
|`--container <name>`|Supported image name (required, e.g., "ubuntu-24", "debian-13", "alpine")|
|`--arch <arch>`|Target architecture: amd64, arm64, or arm (default: amd64)|

All other arguments are passed through to the sanity test runner.

## References

The following public documentation pages provide details on end-user VS Code setup scenarios.

- [Download VS Code](https://code.visualstudio.com/Download)
- [Requirements](https://code.visualstudio.com/docs/supporting/requirements)
- [Setup Overview](https://code.visualstudio.com/docs/setup/setup-overview)
- [Linux Setup](https://code.visualstudio.com/docs/setup/linux)
- [macOS Setup](https://code.visualstudio.com/docs/setup/mac)
- [Windows Setup](https://code.visualstudio.com/docs/setup/windows)
- [Portable Mode](https://code.visualstudio.com/docs/editor/portable)
- [VS Code Server](https://code.visualstudio.com/docs/remote/vscode-server)
- [Developing in WSL](https://code.visualstudio.com/docs/remote/wsl)
