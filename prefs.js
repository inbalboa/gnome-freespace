import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const FreeSpacePrefsWidget = GObject.registerClass(class FreeSpacePrefsWidget extends Adw.PreferencesPage {
    _init(settings) {
        super._init({
            title: _('Settings'),
            icon_name: 'settings-symbolic',
        });

        this._settings = settings;
        this._mountPoints = [];

        this._createUI();
        this._loadMountPoints();
    }

    _createUI() {
        // Main mount point group
        const mainGroup = new Adw.PreferencesGroup({
            title: _('Main'),
            description: _('Choose how to show the indicator'),
        });
        this.add(mainGroup);
        this._mainMountPointRow = new Adw.ComboRow({
            title: _('Main Mount Point'),
            subtitle: _('This will be shown in the top panel'),
        });
        mainGroup.add(this._mainMountPointRow);

        // Display mode
        const indicatorDisplayRow = new Adw.ComboRow({
            title: _('Display Mode'),
            subtitle: _('What to show in the panel indicator'),
        });

        // Create model for display options
        const displayModel = Gtk.StringList.new([
            _('Icon and Label'),
            _('Only Icon'),
            _('Only Label'),
        ]);
        indicatorDisplayRow.model = displayModel;

        // Set current selection based on settings
        const modes = ['both', 'icon', 'label'];
        const modesMap = {
            'both': 0,
            'icon': 1,
            'label': 2,
        };
        const currentMode = this._settings.get_string('indicator-display-mode');
        const selectedIndex = modesMap[currentMode] || 0;
        indicatorDisplayRow.selected = selectedIndex;
        indicatorDisplayRow.connect('notify::selected', () => {
            if (indicatorDisplayRow.selected >= 0)
                this._settings.set_string('indicator-display-mode', modes[indicatorDisplayRow.selected]);
        });
        mainGroup.add(indicatorDisplayRow);

        // units
        const binaryUnitsRow = new Adw.SwitchRow({
            title: _('Use Binary Units'),
            subtitle: _('Show KiB, MiB, GiB instead of KB, MB, GB'),
        });
        binaryUnitsRow.active = this._settings.get_boolean('use-binary-units');
        binaryUnitsRow.connect('notify::active', () => this._settings.set_boolean('use-binary-units', binaryUnitsRow.active));
        mainGroup.add(binaryUnitsRow);

        // auto-refresh
        const intervalRow = new Adw.SpinRow({
            title: _('Refresh Interval'),
            subtitle: _('Update frequency in seconds'),
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 3600,
                step_increment: 10,
                page_increment: 60,
                value: this._settings.get_int('refresh-interval'),
            }),
        });
        intervalRow.connect('notify::value', () => this._settings.set_int('refresh-interval', intervalRow.value));
        mainGroup.add(intervalRow);

        // Hidden mount points group
        const hiddenGroup = new Adw.PreferencesGroup({
            title: _('Hidden Mount Points'),
            description: _('Select which mount points to hide from the menu'),
        });
        this.add(hiddenGroup);
        this._hiddenMountPointsBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });
        const hiddenScrolled = new Gtk.ScrolledWindow({
            child: this._hiddenMountPointsBox,
            min_content_height: 75,
            max_content_height: 250,
            propagate_natural_height: true,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        });
        const hiddenFrame = new Gtk.Frame({
            child: hiddenScrolled,
            margin_top: 6,
        });
        hiddenGroup.add(hiddenFrame);

        // Refresh button group
        const refreshGroup = new Adw.PreferencesGroup();
        this.add(refreshGroup);
        const refreshRow = new Adw.ActionRow({
            title: _('Refresh Mount Points'),
            subtitle: _('Reload the list of available mount points'),
        });
        const refreshButton = new Gtk.Button({
            label: _('Refresh'),
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        refreshButton.connect('clicked', () => this._loadMountPoints());
        refreshRow.add_suffix(refreshButton);
        refreshGroup.add(refreshRow);
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

    _loadMountPoints() {
        this._mountPoints = this._getMountPoints();
        this._updateMainMountPointCombo();
        this._updateHiddenMountPoints();
    }

    _updateMainMountPointCombo() {
        // Clear existing model
        this._mainMountPointRow.model = new Gtk.StringList();

        // Add mount points to combo box
        const currentMain = this._settings.get_string('main-mount-point');
        let selectedIndex = 0;
        this._mountPoints.forEach((mp, index) => {
            this._mainMountPointRow.model.append(mp);
            if (mp === currentMain)
                selectedIndex = index;
        });

        this._mainMountPointRow.selected = selectedIndex;

        // Connect selection change
        this._mainMountPointRow.connect('notify::selected', () => {
            if (this._mainMountPointRow.selected >= 0) {
                const selectedMp = this._mountPoints[this._mainMountPointRow.selected];
                this._settings.set_string('main-mount-point', selectedMp);
            }
        });
    }

    _updateHiddenMountPoints() {
        // Clear existing checkboxes
        let child = this._hiddenMountPointsBox.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this._hiddenMountPointsBox.remove(child);
            child = next;
        }

        const hiddenMountPoints = this._settings.get_strv('hidden-mount-points');

        this._mountPoints.forEach(mp => {
            const checkbox = new Gtk.CheckButton({
                label: mp,
                active: hiddenMountPoints.includes(mp),
            });
            checkbox.connect('toggled', () => {
                let hidden = this._settings.get_strv('hidden-mount-points');
                if (checkbox.active) {
                    if (!hidden.includes(mp))
                        hidden.push(mp);
                } else {
                    hidden = hidden.filter(path => path !== mp);
                }
                this._settings.set_strv('hidden-mount-points', hidden);
            });

            this._hiddenMountPointsBox.append(checkbox);
        });
    }
});

export default class FreeSpacePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(600, 650);
        window.set_size_request(500, 550);

        const prefsPage = new FreeSpacePrefsWidget(this.getSettings());
        window.add(prefsPage);

        const aboutPage = new FreeSpaceAboutPage(this.metadata);
        window.add(aboutPage);
    }
}


export const FreeSpaceAboutPage = GObject.registerClass(class FreeSpaceAboutPage extends Adw.PreferencesPage {
    _init(metadata) {
        super._init({
            title: _('About'),
            icon_name: 'help-about-symbolic',
        });

        const EXTERNAL_LINK_ICON = 'adw-external-link-symbolic';

        const freespaceGroup = new Adw.PreferencesGroup();
        const freespaceBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_top: 10,
            margin_bottom: 10,
            hexpand: false,
            vexpand: false,
        });

        const freespaceLabel = new Gtk.Label({
            label: `<span size="large"><b>${_('FreeSpace')}</b></span>`,
            use_markup: true,
            vexpand: true,
            valign: Gtk.Align.FILL,
        });

        const projectDescriptionLabel = new Gtk.Label({
            label: _('Displays disk free space information'),
            hexpand: false,
            vexpand: false,
            margin_bottom: 5,
        });

        freespaceBox.append(freespaceLabel);
        freespaceBox.append(projectDescriptionLabel);
        freespaceGroup.add(freespaceBox);

        this.add(freespaceGroup);
        // -----------------------------------------------------------------------

        // Extension/OS Info Group------------------------------------------------
        const extensionInfoGroup = new Adw.PreferencesGroup();
        const freespaceVersionRow = new Adw.ActionRow({
            title: _('FreeSpace Version'),
        });
        const releaseVersion = metadata['version-name'] ? metadata['version-name'] : 'unknown';
        freespaceVersionRow.add_suffix(new Gtk.Label({
            label: `${releaseVersion}`,
        }));

        const gnomeVersionRow = new Adw.ActionRow({
            title: _('GNOME Version'),
        });
        gnomeVersionRow.add_suffix(new Gtk.Label({
            label: `${Config.PACKAGE_VERSION.toString()}`,
        }));

        const createdByRow = new Adw.ActionRow({
            title: _('Made by'),
        });
        createdByRow.add_suffix(new Gtk.Label({
            label: 'Serhiy Shliapuhin',
        }));

        const githubLinkRow = new Adw.ActionRow({
            title: 'GitHub',
        });
        githubLinkRow.add_suffix(new Gtk.LinkButton({
            icon_name: EXTERNAL_LINK_ICON,
            uri: 'https://github.com/inbalboa/gnome-freespace',
        }));

        extensionInfoGroup.add(freespaceVersionRow);
        extensionInfoGroup.add(gnomeVersionRow);
        extensionInfoGroup.add(createdByRow);
        extensionInfoGroup.add(githubLinkRow);

        this.add(extensionInfoGroup);
        // -----------------------------------------------------------------------

        const licenseLabel = _('This project is licensed under the GPL-3.0 License.');
        const urlLabel = _('See the %sLicense%s for details.').format('<a href="https://www.gnu.org/licenses/gpl.txt">', '</a>');

        const gnuSoftwareGroup = new Adw.PreferencesGroup();
        const gnuSofwareLabel = new Gtk.Label({
            label: `<span size="small">${licenseLabel}\n${urlLabel}</span>`,
            use_markup: true,
            justify: Gtk.Justification.CENTER,
        });

        const gnuSofwareLabelBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            valign: Gtk.Align.END,
            vexpand: true,
            margin_top: 5,
            margin_bottom: 10,
        });
        gnuSofwareLabelBox.append(gnuSofwareLabel);
        gnuSoftwareGroup.add(gnuSofwareLabelBox);
        this.add(gnuSoftwareGroup);
    }
});

