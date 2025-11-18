#!/bin/sh

echo "uninstalling the sync. extension..."

OS="$(uname)"
echo "detected platform: $OS"

if [ "$OS" != "Darwin" ]; then
  echo "This uninstall script is for macOS only. For Windows, use uninstall.bat"
  exit 1
fi

rmrf() {
  if [ -d "$1" ]; then
    echo "Removing $1"
    rm -rf "$1"
  fi
}

rmf() {
  if [ -f "$1" ]; then
    echo "Removing $1"
    rm -f "$1"
  fi
}

kill_port_3000() {
  if command -v lsof >/dev/null 2>&1; then
    echo "Looking for processes running on port 3000..."
    PORT_PROCS=$(lsof -i :3000 | awk 'NR>1 {print $2}' | sort | uniq)
    if [ -n "$PORT_PROCS" ]; then
      echo "Killing processes on port 3000:"
    echo "$PORT_PROCS"
      echo "$PORT_PROCS" | xargs kill -9
    else
      echo "No processes found on port 3000."
    fi
  else
    echo "lsof not found; please manually stop any servers running on port 3000."
  fi
}

remove_all_panel_variants() {
  base_dir="$1"
  rmrf "$base_dir/com.sync.extension"
  rmrf "$base_dir/com.sync.extension.ae"
  rmrf "$base_dir/com.sync.extension.ppro"
  rmrf "$base_dir/com.sync.extension.ae.panel"
  rmrf "$base_dir/com.sync.extension.ppro.panel"
  rmrf "$base_dir/com.sync.extension.premiere.panel"
}

USER_CEP_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
remove_all_panel_variants "$USER_CEP_DIR"

ALLUSER_CEP_DIR="/Library/Application Support/Adobe/CEP/extensions"
for dn in \
  "com.sync.extension" \
  "com.sync.extension.ae" \
  "com.sync.extension.ppro" \
  "com.sync.extension.ae.panel" \
  "com.sync.extension.ppro.panel" \
  "com.sync.extension.premiere.panel"
do
  target="$ALLUSER_CEP_DIR/$dn"
  echo "removing $target"
  sudo rm -rf "$target"
done

rmrf "$HOME/Library/Application Support/sync. extensions"
sys_data_dir="/Library/Application Support/sync. extensions"
echo "Removing $sys_data_dir"
sudo rm -rf "$sys_data_dir"

kill_port_3000

echo "uninstall complete."
