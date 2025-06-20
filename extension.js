import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const FreeSpaceIndicator = GObject.registerClass(
class FreeSpaceIndicator extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, _('Free Space'));

        this._settings = settings;
        this._disksInfo = this._getAllDisksInfo();
        this._timeoutId = null;

        // Create the panel container
        this._hbox = new St.BoxLayout({
            style_class: 'panel-status-menu-box',
        });
        this._icon = new St.Icon({
            icon_name: 'drive-harddisk-symbolic',
            style_class: 'system-status-icon',
        });
        this._label = new St.Label({
            text: '...',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._hbox);

        // initial setting filling
        this._fillSettings();

        // Set initial display mode
        this._updateIndicatorDisplay();

        // Create popup menu
        this._createMenu();

        this._updateMainTitle();
        this._updateMenu();


        // Connect settings changes
        this._settings.connect('changed', this._onSettingsChanged.bind(this));

        // Start monitoring
        this._startMonitoring();
    }

    _createMenu() {
        // header
        const headerItem = new PopupMenu.PopupMenuItem(_('Disk Space Usage'), {
            reactive: false,
            can_focus: false,
            style_class: 'freespace-popup-subtitle-menu-item',
        });
        this.menu.addMenuItem(headerItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._layoutSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._layoutSection);

        // refresh button
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const refreshItem = new PopupMenu.PopupMenuItem(_('Refresh'));
        refreshItem.connect('activate', () => {
            this._disksInfo = this._getAllDisksInfo();
            this._updateMainTitle();
            this._updateMenu();
        });
        this.menu.addMenuItem(refreshItem);
    }

    _fillSettings() {
        this._mainMountPoint = this._settings.get_string('main-mount-point');
        this._hiddenMountPoints = this._settings.get_strv('hidden-mount-points');
        this._useBinaryUnits = this._settings.get_boolean('use-binary-units');
        this._displayMode = this._settings.get_string('indicator-display-mode');
        this._refreshInterval = this._settings.get_int('refresh-interval');
    }

    _onSettingsChanged() {
        this._stopMonitoring();
        this._fillSettings();
        this._updateIndicatorDisplay();
        this._updateMainTitle();
        this._updateMenu();
        this._startMonitoring();
    }

    _updateIndicatorDisplay() {
        // Clear current children
        this._hbox.remove_all_children();

        // Add children based on display mode
        switch (this._displayMode) {
        case 'icon':
            this._hbox.add_child(this._icon);
            break;
        case 'label':
            this._hbox.add_child(this._label);
            break;
        case 'both':
        default:
            this._hbox.add_child(this._icon);
            this._hbox.add_child(this._label);
            break;
        }
    }

    _formatBytes(bytes, bi = true, condensed = false) {
        if (bytes === 0)
            return condensed ? '0' : '0 B';

        const k = bi ? 1024 : 1000;
        const sizes = bi ? ['', 'Ki', 'Mi', 'Gi', 'Ti'] : ['', 'K', 'M', 'G', 'T'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        const sizeFmt = condensed ? `${sizes[i]}` : ` ${sizes[i]}B`;
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))}${sizeFmt}`;
    }

    _getAllDisksInfo() {
        return this._getMountPoints().map(mp => {
            const diskInfo = this._getDiskInfo(mp);
            if (!diskInfo)
                return {};
            return {
                path: mp,
                total: diskInfo.total,
                free: diskInfo.free,
            };
        });
    }

    _getMountPoints() {
        try {
            const [success, stdout] = GLib.spawn_command_line_sync('findmnt --fstab --json --types=swap --invert');
            if (!success)
                return [];

            const mountData = JSON.parse(new TextDecoder().decode(stdout));
            return mountData.filesystems.map(md => md.target);
        } catch (e) {
            console.error('Error getting mount points:', e);
            return [];
        }
    }

    _getDiskInfo(mountPoint) {
        try {
            const f = Gio.File.new_for_path(mountPoint);
            const info = f.query_filesystem_info('filesystem::*', null);
            return {
                total: info.get_attribute_uint64('filesystem::size'),
                free: info.get_attribute_uint64('filesystem::free'),
            };
        } catch (e) {
            console.error('Error getting disk space:', e);
            return null;
        }
    }

    _updateMainTitle() {
        const visibleDisksInfo = this._disksInfo.filter(di => !this._hiddenMountPoints.includes(di.path));
        let mainDisk = visibleDisksInfo.find(di => di.path === this._mainMountPoint);
        if (!mainDisk && visibleDisksInfo.length > 0)
            mainDisk = visibleDisksInfo[0];

        if (mainDisk)
            this._label.text = this._formatBytes(mainDisk.free, this._useBinaryUnits, true);
        else
            this._label.text = _('No disks');
    }

    _updateMenu() {
        this._layoutSection.removeAll();

        // Filter out hidden mount points and make main point first
        const visibleDisksInfo = this._disksInfo
            .filter(di => !this._hiddenMountPoints.includes(di.path))
            .sort((x, y) => {
                const isXMain = x.path === this._mainMountPoint;
                const isYMain = y.path === this._mainMountPoint;
                if (isXMain === isYMain)
                    return 0;
                else
                    return isXMain ? -1 : 1;
            });

        // Add menu items for each visible mount point
        visibleDisksInfo.forEach((mp, i, mpa) => {
            const pathItem = new PopupMenu.PopupMenuItem(`Mounted on ${mp.path}`, {
                reactive: false,
                style_class: 'freespace-mountpoint-popup-menu-item',
            });
            this._layoutSection.addMenuItem(pathItem);

            const freeFmt = this._formatBytes(mp.free, this._useBinaryUnits, false);
            const totalFmt = this._formatBytes(mp.total, this._useBinaryUnits, false);
            const itemInfo = new PopupMenu.PopupMenuItem(`Free ${freeFmt} of ${totalFmt}`, {
                reactive: false,
                style_class: 'freespace-freeinfo-popup-menu-item',
            });
            this._layoutSection.addMenuItem(itemInfo);

            if (i < (mpa.length - 1))
                this._layoutSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        });
    }

    _startMonitoring() {
        // update at the specified interval
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this._refreshInterval, () => {
            this._disksInfo = this._getAllDisksInfo();
            this._updateMainTitle();
            this._updateMenu();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopMonitoring() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
    }

    destroy() {
        this._stopMonitoring();
        super.destroy();
    }
});

export default class FreeSpaceExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = new FreeSpaceIndicator(this._settings);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._settings = null;
    }
}
