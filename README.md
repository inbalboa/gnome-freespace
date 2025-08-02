# Free Space Indicator — GNOME Shell Extension
[<img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true" height="100">](https://extensions.gnome.org/extension/8383/free-space-indicator/)

[![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-48+-blue.svg)](https://gitlab.gnome.org/GNOME/gnome-shell)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

A GNOME Shell extension that displays disk free space information in the top panel.

![Extension Screenshot](screenshot.png)

## Features

- Shows free space for your main mount point in the top panel
- Click to view disk usage for all visible mount points
- Choose between icon only, text only, or both in the panel
- Configuration: 
  - Select which mount point to display as primary
  - Hide unwanted mount points from the popup menu
  - Toggle between binary (KiB, MiB, GiB) and decimal (KB, MB, GB) units
  - Set custom update intervals

## Requirements

- GNOME Shell 48+
- `findmnt` command (usually part of util-linux package)

## Installation

### From GNOME Extensions

https://extensions.gnome.org/extension/8277/screen-brightness-governor/

### Manual Installation

1. **Download and install the extension files**

   ```sh
   git clone https://github.com/inbalboa/gnome-freespace.git
   cd gnome-freespace
   make install
   ```
   Requires `git`, `make`, `jq`

2. **Restart GNOME Shell**

   Log out and log back in.

3. **Enable the extension**
   ```sh
   gnome-extensions enable freespace@inbalboa.github.io
   ```

## License

This project is licensed under the GPL-3.0 License - see the [LICENSE](LICENSE) file for details.

---

Made with ❤️ for the GNOME community
