const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, Notification, dialog } = require('electron'); // 添加 dialog
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');

// --- 设置存储 ---
const store = new Store({
    defaults: {
        timers: {
            work: 25 * 60,
            shortrest: 5 * 60,
            longrest: 15 * 60
        },
        longBreakInterval: 4,
        enableCompletionSound: true,
        enableTickingSound: true,
        // 新增：自定义声音路径
        customSoundStart: '',
        customSoundTick: '',
        customSoundComplete: '',
        pauseAfterWork: false,
        enableNotifications: true,
        launchAtLogin: false,
        language: 'zh'
    }
});

// --- Globals ---
let tray = null;
let flyoutWindow = null;
let settingsWindow = null;
let currentTimerState = { state: 'idle', timeLeft: 0 };
let currentSettings = store.get(); // Load initial settings
let currentLocaleData = {};


// --- Load Locale Data ---
function loadLocaleData(lang) {
    try {
        const localePath = path.join(__dirname, 'locales', `${lang}.json`);
        if (fs.existsSync(localePath)) {
            const rawData = fs.readFileSync(localePath);
            currentLocaleData = JSON.parse(rawData);
            console.log(`Loaded locale: ${lang}`);
        } else {
            console.error(`Locale file not found: ${localePath}. Falling back to default.`);
            if (lang !== 'en') loadLocaleData('en');
        }
    } catch (error) {
        console.error('Error loading locale data:', error);
        if (lang !== 'en') loadLocaleData('en');
    }
}

// --- Translation Helper ---
function translate(key, replacements = {}) {
    let translation = currentLocaleData[key] || key;
    for (const placeholder in replacements) {
        translation = translation.replace(`{${placeholder}}`, replacements[placeholder]);
    }
    return translation;
}

const icons = {
    idle: nativeImage.createFromPath(path.join(__dirname, 'Icons', 'idle.png')).resize({ width: 16, height: 16 }),
    work: nativeImage.createFromPath(path.join(__dirname, 'Icons', 'work.png')).resize({ width: 16, height: 16 }),
    shortrest: nativeImage.createFromPath(path.join(__dirname, 'Icons', 'shortrest.png')).resize({ width: 16, height: 16 }),
    longrest: nativeImage.createFromPath(path.join(__dirname, 'Icons', 'longrest.png')).resize({ width: 16, height: 16 }),
    appIcon: nativeImage.createFromPath(path.join(__dirname, 'Icons', 'icon.ico'))
};

// --- Window Creation ---
function createFlyoutWindow() {
    flyoutWindow = new BrowserWindow({
        width: 280,
        height: 180,
        show: false,
        frame: false,
        fullscreenable: false,
        resizable: false,
        movable: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false
        },
        icon: icons.appIcon
    });

    flyoutWindow.loadFile(path.join(__dirname, 'index.html'));

    flyoutWindow.webContents.on('did-finish-load', () => {
        // 确保发送完整的 currentSettings
        flyoutWindow.webContents.send('initialize-data', { settings: currentSettings, localeData: currentLocaleData });
    });

    flyoutWindow.on('blur', () => {
        if (flyoutWindow && !flyoutWindow.webContents.isDevToolsFocused()) {
            flyoutWindow.hide();
        }
    });

    flyoutWindow.on('closed', () => {
        flyoutWindow = null;
    });
}

function createSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 480, // Increased width
        height: 460, // Increased height
        resizable: false,
        fullscreenable: false,
        modal: true,
        parent: flyoutWindow,
        show: true,
        frame: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: icons.appIcon
    });

    settingsWindow.loadFile(path.join(__dirname, 'settings.html'));

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

// --- Tray Creation ---
function createTray() {
    tray = new Tray(icons.idle);
    buildContextMenu();
    updateTrayTooltip();

    tray.on('click', (event, bounds) => {
        toggleWindow(bounds);
    });

    tray.on('right-click', () => {
        buildContextMenu();
        tray.popUpContextMenu(Menu.getApplicationMenu());
    });
}

// --- Build Context Menu Dynamically ---
function buildContextMenu() {
    const contextMenuTemplate = [
        { label: translate('menu_show_hide'), click: () => toggleWindow(tray.getBounds()) },
        { label: translate('menu_settings'), click: createSettingsWindow },
        { type: 'separator' },
        { label: translate('menu_quit'), click: () => app.quit() }
    ];
    const contextMenu = Menu.buildFromTemplate(contextMenuTemplate);
    Menu.setApplicationMenu(contextMenu);
}

// --- Window Positioning and Toggling ---
function getWindowPosition(trayBounds) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: windowWidth, height: windowHeight } = flyoutWindow.getBounds();

    let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowWidth / 2));
    let y = Math.round(trayBounds.y - windowHeight - 5);

    if (x < primaryDisplay.bounds.x) {
        x = primaryDisplay.bounds.x;
    } else if (x + windowWidth > primaryDisplay.bounds.x + primaryDisplay.bounds.width) {
        x = primaryDisplay.bounds.x + primaryDisplay.bounds.width - windowWidth;
    }
    if (y < primaryDisplay.bounds.y) {
        y = trayBounds.y + trayBounds.height + 5;
    }

    return { x, y };
}

function toggleWindow(bounds) {
    if (!flyoutWindow) return;
    if (flyoutWindow.isVisible()) {
        flyoutWindow.hide();
    } else {
        const trayBounds = bounds || tray.getBounds();
        const position = getWindowPosition(trayBounds);
        flyoutWindow.setPosition(position.x, position.y);
        flyoutWindow.show();
        flyoutWindow.focus();
    }
}

// --- App Lifecycle ---
app.whenReady().then(() => {
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
        app.quit();
        return;
    }
    app.on('second-instance', () => {
        if (flyoutWindow) {
            toggleWindow(tray.getBounds());
        }
    });

    const appPath = app.isPackaged ? process.execPath : app.getPath('exe');
    app.setLoginItemSettings({
        openAtLogin: currentSettings.launchAtLogin,
        path: appPath,
        args: []
    });

    loadLocaleData(currentSettings.language);
    createFlyoutWindow();
    createTray();

    if (process.platform === 'darwin') {
        app.dock.hide();
    }
});

app.on('window-all-closed', () => {});

// --- IPC Handling ---
ipcMain.on('timer-update', (event, newState) => {
    currentTimerState = newState;
    if (tray) {
        const icon = icons[newState.state] || icons.idle;
        tray.setImage(icon);
        updateTrayTooltip();
    }
});

ipcMain.on('close-flyout', () => {
    if (flyoutWindow) {
        flyoutWindow.hide();
    }
});

// 处理获取设置和本地化数据的请求
ipcMain.handle('get-settings-and-locale', async (event) => {
    // 确保返回最新的 currentSettings
    return { settings: currentSettings, localeData: currentLocaleData };
});

// 新增：处理文件选择请求
ipcMain.handle('select-file', async (event) => {
    const result = await dialog.showOpenDialog(settingsWindow, { // 将 settingsWindow 作为父窗口
        title: translate('settings_select_file'), // 使用翻译后的标题
        properties: ['openFile'],
        filters: [
            { name: 'Audio Files', extensions: ['wav'] } // 限制为 WAV 文件
        ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0]; // 返回选择的文件路径
    }
    return null; // 如果取消或未选择文件，则返回 null
});

// 处理保存设置的请求
ipcMain.on('save-settings', (event, newSettings) => {
    console.log('正在保存设置:', newSettings);
    // 确保所有预期的键都存在，特别是布尔值和新添加的字段
    const completeSettings = {
        ...store.defaults, // 从默认值开始
        ...newSettings     // 用提供的新设置覆盖
    };
    store.set(completeSettings); // 持久化完整的设置对象
    currentSettings = completeSettings; // 更新内存中的设置

    try {
        const appPath = app.isPackaged ? process.execPath : app.getPath('exe');
        const currentLoginSettings = app.getLoginItemSettings();
        if (currentLoginSettings.openAtLogin !== newSettings.launchAtLogin) {
            app.setLoginItemSettings({
                openAtLogin: newSettings.launchAtLogin,
                path: appPath,
                args: []
            });
            console.log('Launch at login setting updated:', newSettings.launchAtLogin);
        }
    } catch (error) {
        console.error('Failed to update login item settings:', error);
    }

    // 如果语言更改，重新加载本地化数据并更新菜单
    if (currentLocaleData.language !== newSettings.language) { // 比较之前的语言和新设置的语言
        loadLocaleData(newSettings.language);
        buildContextMenu(); // 重新构建菜单以应用新语言
    }

    // 通知渲染进程设置已更新，发送完整的设置对象
    if (flyoutWindow && !flyoutWindow.isDestroyed()) {
        flyoutWindow.webContents.send('settings-updated', { settings: currentSettings, localeData: currentLocaleData });
    }
});

// IPC handler for showing notifications from renderer
ipcMain.on('show-notification', (event, { title, body }) => {
    if (Notification.isSupported()) {
        const notification = new Notification({
            title: title,
            body: body,
            icon: icons.appIcon, // Use app icon for notification
            silent: !currentSettings.enableCompletionSound // Optionally silence notification if sounds are off
        });
        notification.show();
    } else {
        console.log('Notifications not supported on this system.');
    }
});

// Helper to update tooltip based on stored state
function updateTrayTooltip() {
    if (!tray) return;
    let tooltipText = translate('tray_tooltip_idle');
    if (currentTimerState.state !== 'idle') {
        const minutes = Math.floor(currentTimerState.timeLeft / 60);
        const seconds = currentTimerState.timeLeft % 60;
        const stateKey = `state_${currentTimerState.state}`;
        const stateText = translate(stateKey);
        tooltipText = translate('tray_tooltip_running', {
            state: stateText,
            time: `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
        });
    }
    tray.setToolTip(tooltipText);
}

// --- Cleanup ---
app.on('before-quit', () => {
    if (tray) {
        tray.destroy();
    }
    if (flyoutWindow && !flyoutWindow.isDestroyed()) {
        flyoutWindow.destroy();
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.destroy();
    }
});
