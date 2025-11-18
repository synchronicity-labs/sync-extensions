#!/bin/bash
cd "$(dirname "$0")"
exec ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron backend.js "$@"

