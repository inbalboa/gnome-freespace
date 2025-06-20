import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const FreeSpaceIndicator = GObject.registerClass(class FreeSpaceIndicator extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, _('Free Space'));

        this._settings = settings;
        this._timeoutId = null;

        // create the panel container
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

        // initial fill of disk info
        this._refillVisibleDisksInfo(true);

        // set initial display mode
        this._updateIndicatorDisplay();

        // create popup menu
        this._createMenu();

        this._updateMainTitle();
        this._updateMenu();

        // connect settings changes
        this._settings.connect('changed', this._onSettingsChanged.bind(this));

        // start monitoring
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
            this._refillVisibleDisksInfo(true);
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
        this._hbox.remove_all_children();

        switch (this._displayMode) {
        case 'icon':
            this._hbox.add_child(this._icon);
            break;
        case 'label':
            this._hbox.add_child(this._label);
            break;
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
        return `${parseFloat((bytes / k ** i).toFixed(1))}${sizeFmt}`;
    }

    _getAllDisksInfo() {
        return this._getMountPoints().map(mountData => {
            const diskInfo = this._getDiskInfo(mountData.path);
            if (!diskInfo)
                return {};
            return {
                path: mountData.path,
                device: mountData.device,
                total: diskInfo.total,
                free: diskInfo.free,
                used: diskInfo.used,
            };
        });
    }

    _getMountPoints() {
        try {
            const [success, stdout] = GLib.spawn_command_line_sync('findmnt --fstab --json --types=swap --invert --output=SOURCE,TARGET');
            if (!success)
                return [];

            const mountData = JSON.parse(new TextDecoder().decode(stdout));
            return mountData.filesystems.map(md => ({
                path: md.target,
                device: this._getMountPointSourceDevice(md.target) || md.source
            }));
        } catch (e) {
            console.error('Error getting mount points:', e);
            return [];
        }
    }

    _getMountPointSourceDevice(mountPath) {
        try {
            const [success, stdout] = GLib.spawn_command_line_sync(`findmnt --json --output=SOURCE -- ${mountPath}`);
            if (!success)
                return null;

            const mountData = JSON.parse(new TextDecoder().decode(stdout));
            if (mountData.filesystems.length > 0)
                return mountData.filesystems[0].source
        } catch (e) {
            console.error('Error getting mount point source device:', e);
            return null;
        }

    }

    _getDiskInfo(mountPoint) {
        try {
            const f = Gio.File.new_for_path(mountPoint);
            const info = f.query_filesystem_info('filesystem::*', null);
            return {
                total: info.get_attribute_uint64('filesystem::size'),
                free: info.get_attribute_uint64('filesystem::free'),
                used: info.get_attribute_uint64('filesystem::size') - info.get_attribute_uint64('filesystem::free'),
            };
        } catch (e) {
            console.error('Error getting disk space:', e);
            return null;
        }
    }

    _refillVisibleDisksInfo(force = false) {
        const disksInfo = this._getAllDisksInfo();
        const newVisibleDisksInfo = disksInfo
            .filter(di => !this._hiddenMountPoints.includes(di.path))
            .sort((x, y) => {
                const isXMain = x.path === this._mainMountPoint;
                const isYMain = y.path === this._mainMountPoint;
                if (isXMain === isYMain)
                    return 0;
                else
                    return isXMain ? -1 : 1;
            });

        if (force || !this._visibleDisksInfo || this._visibleDisksInfo.length !== newVisibleDisksInfo.length) {
            this._visibleDisksInfo = newVisibleDisksInfo;
            return true;
        }

        for (const [i, di] of newVisibleDisksInfo.entries()) {
            const exDi = this._visibleDisksInfo[i];
            const changeThreshold = 100000000;
            if (exDi.path !== di.path || Math.abs(exDi.used - di.used) > changeThreshold) {
                this._visibleDisksInfo = newVisibleDisksInfo;
                return true;
            }
        }
        return false;
    }

    _updateMainTitle() {
        let mainDisk = this._visibleDisksInfo.find(di => di.path === this._mainMountPoint);
        if (!mainDisk && this._visibleDisksInfo.length > 0)
            mainDisk = this._visibleDisksInfo[0];

        if (mainDisk)
            this._label.text = this._formatBytes(mainDisk.free, this._useBinaryUnits, true);
        else
            this._label.text = _('No disks');
    }

    _updateMenu() {
        this._layoutSection.removeAll();

        this._visibleDisksInfo.forEach((mp, i, mpa) => {
            const menuItem = new PopupMenu.PopupMenuItem('', {
                reactive: false,
                style_class: 'freespace-mountpoint-popup-menu-item',
            });
            menuItem.label.clutter_text.set_markup(`${mp.device} on <b>${mp.path}</b>`);
            this._layoutSection.addMenuItem(menuItem);

            this._layoutSection.addMenuItem(this._makeProgressItem(mp.used, mp.total));

            if (i < (mpa.length - 1))
                this._layoutSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        });
    }

    _makeProgressItem(used, total) {
        const progressItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });

        const themeStyle = this._isDarkTheme() ? 'dark' : 'light';

        const progressOuter = new St.Widget({
            style_class: `progress-outer ${themeStyle}`,
            layout_manager: new Clutter.BinLayout(),  // allows overlay
            x_expand: true,
            y_expand: true,
        });

        const progressInner = new St.Widget({
            style_class: `progress-inner ${themeStyle}`,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        progressOuter.add_child(progressInner);

        const usedFmt = this._formatBytes(used, this._useBinaryUnits, false);
        const totalFmt = this._formatBytes(total, this._useBinaryUnits, false);
        const progressLabel = new St.Label({
            text: `${usedFmt} / ${totalFmt}`,
            style_class: `progress-label ${themeStyle}`,
        });
        progressOuter.add_child(progressLabel);

        progressItem.actor.add_child(progressOuter);

        // set progress width after the widget is mapped and has proper dimensions
        progressOuter.connect('notify::mapped', () => {
            if (progressOuter.mapped && progressOuter.width > 0) {
                const progressWidth = Math.round(progressOuter.width * used / total);
                progressInner.width = Math.max(1, progressWidth);
            }
        });

        return progressItem;
    }

    _isDarkTheme() {
        const settings = new Gio.Settings({schema: 'org.gnome.desktop.interface'});
        const colorScheme = settings.get_string('color-scheme');
        return colorScheme.includes('dark');
    }

    _startMonitoring() {
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this._refreshInterval, () => {
            if (this._refillVisibleDisksInfo()) {
                this._updateMainTitle();
                this._updateMenu();
            }
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

