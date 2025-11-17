#!/bin/bash
# Wrapper script to launch Electron for DaVinci Resolve
cd "$(dirname "$0")"
exec ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron backend.js "$@"

