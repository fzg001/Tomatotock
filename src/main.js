const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, Notification, dialog, globalShortcut } = require('electron'); // 添加 dialog 和 globalShortcut
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');
const { execSync } = require('child_process'); // 用于获取系统字体

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
        customSoundStart: '',
        customSoundTick: '',
        customSoundComplete: '',
        pauseAfterWork: false,
        enableNotifications: true,
        launchAtLogin: false,
        enableHotkeys: true, // 新增快捷键设置
        hotkeyStartPause: 'Ctrl+Alt+P',
        hotkeyReset: 'Ctrl+Alt+R',
        enableStats: true, // 新增统计功能开关
        language: 'zh',
        windowPosition: null, // 新增：记住窗口位置
        keepVisibleWhenUnfocused: false,  // 修改：重命名 alwaysOnTop
        appearance: {
            fontFamily: 'default', // 新增字体设置
            cardBg: '#f0f0f0',
            cardOpacity: 1,
            timerColor: '#444444',
            idleColor: '#888888',
            workColor: '#d9534f',
            shortrestColor: '#5cb85c',
            longrestColor: '#428bca',
            btnBg: '#ffffff',
            btnHoverBg: '#e6e6e6',
            btnActiveBg: '#d4d4d4',
            btnColor: '#333333',
            btnActiveColor: '#c9302c',
            btnActiveBorder: '#c9302c'
        }
    }
});

let statsStore = new Store({ name: 'stats', defaults: { records: [] } }); // 统计数据存储

// --- Globals ---
let tray = null;
let flyoutWindow = null;
let settingsWindow = null;
let statsWindow = null;
let currentTimerState = { state: 'idle', timeLeft: 0 };
let currentSettings = store.get(); // Load initial settings
let currentLocaleData = {};
let lastTrayState = null;

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
        movable: true, // 改为true，允许窗口移动
        transparent: true,
        alwaysOnTop: currentSettings.keepVisibleWhenUnfocused, // 修改：使用新设置
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
        flyoutWindow.webContents.send('initialize-data', { settings: currentSettings, localeData: currentLocaleData });
    });

    // 修改：仅在非置顶模式下点击其他位置时才隐藏窗口
    flyoutWindow.on('blur', () => {
        if (flyoutWindow && !flyoutWindow.webContents.isDevToolsFocused()) {
            // 修改：仅在 keepVisibleWhenUnfocused 为 false 时隐藏
            if (!currentSettings.keepVisibleWhenUnfocused) {
                flyoutWindow.hide();
            }
        }
    });

    // 保存窗口位置
    flyoutWindow.on('moved', () => {
        if (flyoutWindow && !flyoutWindow.isDestroyed()) {
            const position = flyoutWindow.getPosition();
            currentSettings.windowPosition = { x: position[0], y: position[1] };
            store.set('windowPosition', currentSettings.windowPosition);
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
        width: 560, // 原来是480，增加1/6后为560
        height: 537, // 原来是460，增加1/6后为537
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

function createStatsWindow() {
    if (statsWindow) {
        statsWindow.focus();
        return;
    }

    statsWindow = new BrowserWindow({
        width: 560, // 原来是480，增加1/6后为560
        height: 607, // 原来是520，增加1/6后为607
        resizable: false,
        modal: true,
        show: true,
        parent: flyoutWindow,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: icons.appIcon
    });

    statsWindow.loadFile(path.join(__dirname, 'stats.html'));

    statsWindow.on('closed', () => {
        statsWindow = null;
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
        { 
            label: translate('menu_restore_position'), 
            click: () => {
                if (flyoutWindow) {
                    const position = getWindowPosition(tray.getBounds());
                    flyoutWindow.setPosition(position.x, position.y);
                    // 重置存储的位置
                    currentSettings.windowPosition = null;
                    store.set('windowPosition', null);
                    if (!flyoutWindow.isVisible()) {
                        flyoutWindow.show();
                    }
                }
            }
        },
        { 
            label: translate('menu_keep_visible_when_unfocused'), // 修改：使用新的翻译键
            type: 'checkbox',
            checked: currentSettings.keepVisibleWhenUnfocused, // 修改：使用新设置
            click: () => {
                currentSettings.keepVisibleWhenUnfocused = !currentSettings.keepVisibleWhenUnfocused; // 修改：切换新设置
                if (flyoutWindow) {
                    flyoutWindow.setAlwaysOnTop(currentSettings.keepVisibleWhenUnfocused); // 保持 alwaysOnTop 行为，因为这是 Electron 控制窗口是否置顶的属性

                    // 如果切换到非置顶状态且窗口当前没有焦点，则需要隐藏窗口
                    if (!currentSettings.keepVisibleWhenUnfocused && !flyoutWindow.isFocused()) {
                        flyoutWindow.hide();
                    }

                    // 如果切换到置顶状态且窗口当前不可见，则需要显示窗口
                    if (currentSettings.keepVisibleWhenUnfocused && !flyoutWindow.isVisible()) {
                        toggleWindow(tray.getBounds());
                    }
                }
                store.set('keepVisibleWhenUnfocused', currentSettings.keepVisibleWhenUnfocused); // 修改：保存新设置
                buildContextMenu(); // 重建菜单以更新选中状态
            }
        },
        { label: translate('menu_stats'), click: createStatsWindow },
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
        // 如果有存储的位置，使用它；否则使用默认位置
        if (currentSettings.windowPosition) {
            flyoutWindow.setPosition(currentSettings.windowPosition.x, currentSettings.windowPosition.y);
        } else {
            const trayBounds = bounds || tray.getBounds();
            const position = getWindowPosition(trayBounds);
            flyoutWindow.setPosition(position.x, position.y);
        }
        flyoutWindow.show();
        flyoutWindow.focus();
    }
}

// --- App Lifecycle ---
app.whenReady().then(() => {
    if (process.platform === 'win32') {
        app.setAppUserModelId(process.execPath);
    }

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
    registerGlobalShortcuts(currentSettings); // 注册快捷键

    if (process.platform === 'darwin') {
        app.dock.hide();
    }
});

app.on('window-all-closed', () => {});

app.on('will-quit', () => {
    globalShortcut.unregisterAll(); // 注销快捷键
});

// --- 注册全局快捷键 ---
function registerGlobalShortcuts(settings) {
    const { globalShortcut } = require('electron');
    globalShortcut.unregisterAll();
    if (!settings.enableHotkeys) return;
    if (settings.hotkeyStartPause) {
        globalShortcut.register(settings.hotkeyStartPause, () => {
            if (flyoutWindow) flyoutWindow.webContents.send('hotkey-start-pause');
        });
    }
    if (settings.hotkeyReset) {
        globalShortcut.register(settings.hotkeyReset, () => {
            if (flyoutWindow) flyoutWindow.webContents.send('hotkey-reset');
        });
    }
}

// 获取系统字体列表
function getSystemFonts() {
    try {
        let fonts = [];
        
        if (process.platform === 'win32') {
            // Windows系统
            const output = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" /s').toString();
            const fontRegex = /\s+(.+) \(TrueType\)\s+REG_SZ\s+(.+)/g;
            let match;
            
            while ((match = fontRegex.exec(output)) !== null) {
                const fontName = match[1].trim().replace(' (TrueType)', '');
                fonts.push(fontName);
            }
        } else if (process.platform === 'darwin') {
            // macOS系统
            const fontDirs = [
                '/System/Library/Fonts',
                '/Library/Fonts',
                `${app.getPath('home')}/Library/Fonts`
            ];
            
            fontDirs.forEach(dir => {
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir);
                    files.forEach(file => {
                        if (file.endsWith('.ttf') || file.endsWith('.otf')) {
                            fonts.push(file.replace(/\.(ttf|otf)$/, ''));
                        }
                    });
                }
            });
        } else if (process.platform === 'linux') {
            // Linux系统
            if (fs.existsSync('/usr/share/fonts')) {
                const output = execSync('fc-list : family').toString();
                fonts = Array.from(new Set(output.split('\n').map(line => line.trim()).filter(Boolean)));
            }
        }
        
        // 添加一些常见字体
        const commonFonts = [
            'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 
            'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Tahoma', 'Trebuchet MS',
            '宋体', '黑体', '微软雅黑', '楷体', '仿宋', '隶书', '幼圆'
        ];
        
        // 合并去重
        fonts = Array.from(new Set([...fonts, ...commonFonts]));
        
        // 按字母排序
        return fonts.sort();
    } catch (error) {
        console.error('获取系统字体失败:', error);
        return [];
    }
}

// --- IPC Handling ---
ipcMain.on('timer-update', (event, newState) => {
    currentTimerState = newState;
    if (tray) {
        if (lastTrayState !== newState.state) {
            const icon = icons[newState.state] || icons.idle;
            tray.setImage(icon);
            lastTrayState = newState.state;
        }
        updateTrayTooltip();
    }
});

ipcMain.on('close-flyout', () => {
    if (flyoutWindow) {
        flyoutWindow.hide();
    }
});

ipcMain.handle('get-settings-and-locale', async (event) => {
    return { settings: currentSettings, localeData: currentLocaleData };
});

ipcMain.handle('select-file', async (event) => {
    const result = await dialog.showOpenDialog(settingsWindow, {
        title: translate('settings_select_file'),
        properties: ['openFile'],
        filters: [
            { name: 'Audio Files', extensions: ['wav'] }
        ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.on('save-settings', (event, newSettings) => {
    console.log('正在保存设置:', newSettings);
    // 修正：不要用 ...store.defaults，应该用 store.get() 或直接合并默认对象
    const completeSettings = {
        ...store.get(), // 用当前存储的设置为基础
        ...newSettings
    };
    // 确保 keepVisibleWhenUnfocused 也被正确合并（如果它在 newSettings 中）
    if (newSettings.hasOwnProperty('keepVisibleWhenUnfocused')) {
        completeSettings.keepVisibleWhenUnfocused = newSettings.keepVisibleWhenUnfocused;
    } else {
        // 如果 newSettings 中没有，则从 store 中获取旧值
        completeSettings.keepVisibleWhenUnfocused = store.get('keepVisibleWhenUnfocused', false); // 提供默认值
    }

    store.set(completeSettings);
    currentSettings = completeSettings; // 更新当前设置缓存

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

    if (currentLocaleData.language !== newSettings.language) {
        loadLocaleData(newSettings.language);
        buildContextMenu();
    }

    registerGlobalShortcuts(currentSettings); // 重新注册快捷键

    // 更新窗口的 alwaysOnTop 状态
    if (flyoutWindow && !flyoutWindow.isDestroyed()) {
        flyoutWindow.setAlwaysOnTop(currentSettings.keepVisibleWhenUnfocused);
        flyoutWindow.webContents.send('settings-updated', { settings: currentSettings, localeData: currentLocaleData });
    }
});

ipcMain.on('show-notification', (event, { title, body }) => {
    console.log('[通知调试] 收到 show-notification:', { title, body });
    if (!body || typeof body !== 'string' || body.trim() === '') {
        console.warn('[通知调试] body 为空，跳过通知');
        return;
    }
    if (Notification.isSupported()) {
        try {
            const notification = new Notification({
                title: 'Tomatotock',
                body: body,
                icon: icons.appIcon,
            });
            notification.show();
            console.log('[通知调试] Notification.show() 已调用');
        } catch (e) {
            console.error('[通知调试] Notification 异常:', e);
        }
    } else {
        console.log('[通知调试] Notifications not supported on this system.');
    }
});

// 修改 work-session-complete，仅保存 type/timestamp，不保存备注和时间段
ipcMain.on('work-session-complete', (event, { remark }) => {
    if (!currentSettings.enableStats) return;
    const now = Date.now();
    let record = {
        type: 'work',
        timestamp: new Date(now).toISOString()
    };
    statsStore.set('records', [
        ...statsStore.get('records'),
        record
    ]);
});

ipcMain.handle('get-stats', () => {
    return statsStore.get('records');
});

ipcMain.handle('get-system-fonts', () => {
    return getSystemFonts();
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
