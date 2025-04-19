const { ipcRenderer } = require('electron');
const path = require('path'); // 需要 path 模块来获取文件名

// 输入元素
const workDurationInput = document.getElementById('work-duration');
const shortBreakDurationInput = document.getElementById('short-break-duration');
const longBreakDurationInput = document.getElementById('long-break-duration');
const longBreakIntervalInput = document.getElementById('long-break-interval'); // New
const enableCompletionSoundCheckbox = document.getElementById('enable-completion-sound'); // New
const enableTickingSoundCheckbox = document.getElementById('enable-ticking-sound'); // New
const customSoundStartButton = document.getElementById('custom-sound-start-button');
const customSoundTickButton = document.getElementById('custom-sound-tick-button');
const customSoundCompleteButton = document.getElementById('custom-sound-complete-button');
const customSoundStartPathSpan = document.getElementById('custom-sound-start-path');
const customSoundTickPathSpan = document.getElementById('custom-sound-tick-path');
const customSoundCompletePathSpan = document.getElementById('custom-sound-complete-path');
const removeSoundStartButton = document.getElementById('remove-sound-start-button'); 
const removeSoundTickButton = document.getElementById('remove-sound-tick-button'); 
const removeSoundCompleteButton = document.getElementById('remove-sound-complete-button'); 
const languageSelect = document.getElementById('language-select');
const fontFamilySelect = document.getElementById('appearance-font-family'); // 新增
const launchAtLoginCheckbox = document.getElementById('launch-at-login'); // New
const pauseAfterWorkCheckbox = document.getElementById('pause-after-work'); // New
const autoHideOnStartCheckbox = document.getElementById('auto-hide-on-start'); // 新增
const enableStatsCheckbox = document.getElementById('enable-stats');
const enableHotkeysCheckbox = document.getElementById('enable-hotkeys');
const hotkeyStartPauseInput = document.getElementById('hotkey-start-pause');
const hotkeyResetInput = document.getElementById('hotkey-reset');
const saveButton = document.getElementById('save-button');
const cancelButton = document.getElementById('cancel-button');

// 外观设置元素
const appearanceFields = {
    fontFamily: document.getElementById('appearance-font-family'), // 新增
    cardBg: document.getElementById('appearance-card-bg'),
    cardOpacity: document.getElementById('appearance-card-opacity'),
    timerColor: document.getElementById('appearance-timer-color'),
    idleColor: document.getElementById('appearance-idle-color'),
    workColor: document.getElementById('appearance-work-color'),
    shortrestColor: document.getElementById('appearance-shortrest-color'),
    longrestColor: document.getElementById('appearance-longrest-color'),
    btnBg: document.getElementById('appearance-btn-bg'),
    btnHoverBg: document.getElementById('appearance-btn-hover-bg'),
    btnActiveBg: document.getElementById('appearance-btn-active-bg'),
    btnColor: document.getElementById('appearance-btn-color'),
    btnActiveColor: document.getElementById('appearance-btn-active-color'),
    btnActiveBorder: document.getElementById('appearance-btn-active-border'),
    cardOpacityValue: document.getElementById('appearance-card-opacity-value'),
    resetBtn: document.getElementById('appearance-reset-button')
};

// 默认外观设置
const defaultAppearance = {
    fontFamily: 'default', // 新增默认字体设置
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
};

function loadAppearance(appearance) {
    const ap = { ...defaultAppearance, ...appearance };
    appearanceFields.fontFamily.value = ap.fontFamily || 'default'; // 新增
    appearanceFields.cardBg.value = ap.cardBg;
    appearanceFields.cardOpacity.value = ap.cardOpacity;
    appearanceFields.cardOpacityValue.textContent = ap.cardOpacity;
    appearanceFields.timerColor.value = ap.timerColor;
    appearanceFields.idleColor.value = ap.idleColor;
    appearanceFields.workColor.value = ap.workColor;
    appearanceFields.shortrestColor.value = ap.shortrestColor;
    appearanceFields.longrestColor.value = ap.longrestColor;
    appearanceFields.btnBg.value = ap.btnBg;
    appearanceFields.btnHoverBg.value = ap.btnHoverBg;
    appearanceFields.btnActiveBg.value = ap.btnActiveBg;
    appearanceFields.btnColor.value = ap.btnColor;
    appearanceFields.btnActiveColor.value = ap.btnActiveColor;
    appearanceFields.btnActiveBorder.value = ap.btnActiveBorder;
}

function getAppearanceFromFields() {
    return {
        fontFamily: appearanceFields.fontFamily.value, // 新增
        cardBg: appearanceFields.cardBg.value,
        cardOpacity: parseFloat(appearanceFields.cardOpacity.value),
        timerColor: appearanceFields.timerColor.value,
        idleColor: appearanceFields.idleColor.value,
        workColor: appearanceFields.workColor.value,
        shortrestColor: appearanceFields.shortrestColor.value,
        longrestColor: appearanceFields.longrestColor.value,
        btnBg: appearanceFields.btnBg.value,
        btnHoverBg: appearanceFields.btnHoverBg.value,
        btnActiveBg: appearanceFields.btnActiveBg.value,
        btnColor: appearanceFields.btnColor.value,
        btnActiveColor: appearanceFields.btnActiveColor.value,
        btnActiveBorder: appearanceFields.btnActiveBorder.value
    };
}

// 透明度滑块显示
appearanceFields.cardOpacity.addEventListener('input', () => {
    appearanceFields.cardOpacityValue.textContent = appearanceFields.cardOpacity.value;
});

// 恢复默认外观
appearanceFields.resetBtn.addEventListener('click', () => {
    loadAppearance(defaultAppearance);
});

// Tab 元素
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

let currentLocaleData = {};
let currentSettings = {}; // 用于存储加载的设置，包括自定义声音路径

// --- Tab 切换逻辑 ---
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Deactivate all buttons and content
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        // Activate clicked button and corresponding content
        button.classList.add('active');
        const tabId = button.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
    });
});

// --- 翻译逻辑 ---
function translateElement(element) {
    const key = element.getAttribute('data-translate');
    const baseKey = element.getAttribute('data-translate-base'); // 用于动态文本的基础键

    if (key && currentLocaleData[key]) {
        if (element.tagName === 'INPUT' && element.type === 'button' || element.tagName === 'BUTTON') {
            element.value = currentLocaleData[key]; // For input buttons
            element.textContent = currentLocaleData[key]; // For button elements
        } else {
            element.textContent = currentLocaleData[key];
        }
    } else if (baseKey && currentLocaleData[baseKey] && element.dataset.filePath === undefined) {
        // 如果元素没有文件路径数据，则使用基础翻译（例如“未选择文件”）
        element.textContent = currentLocaleData[baseKey];
    }
    // Special case for title
    if (element.id === 'settings-title' || element.id === 'settings-title-h2') {
        const titleKey = 'settings_title';
        if (currentLocaleData[titleKey]) {
            element.textContent = currentLocaleData[titleKey];
            if (element.tagName === 'TITLE') document.title = currentLocaleData[titleKey];
        }
    }
}

function applyTranslations() {
    document.querySelectorAll('[data-translate], [data-translate-base]').forEach(translateElement);
    translateElement(document.getElementById('settings-title')); // Translate window title
    translateElement(document.getElementById('settings-title-h2'));
    // 更新文件路径显示的翻译（如果已选择文件则显示文件名，否则显示“未选择文件”）
    updateFilePathDisplay(customSoundStartPathSpan, currentSettings.customSoundStart);
    updateFilePathDisplay(customSoundTickPathSpan, currentSettings.customSoundTick);
    updateFilePathDisplay(customSoundCompletePathSpan, currentSettings.customSoundComplete);
}

// --- 更新文件路径显示 ---
function updateFilePathDisplay(spanElement, filePath) {
    const soundType = spanElement.id.split('-')[3]; // Extract type (start, tick, complete)
    const removeButton = document.getElementById(`remove-sound-${soundType}-button`);
    
    console.log(`更新文件路径: type=${soundType}, path=${filePath}, 按钮元素:`, removeButton);
    
    // 调试打印完整设置对象
    console.log('当前设置对象:', JSON.stringify(currentSettings, null, 2));

    if (filePath && filePath.trim() !== '') {
        spanElement.textContent = path.basename(filePath); // 显示文件名
        spanElement.dataset.filePath = filePath; // 存储完整路径以备后用
        
        // 确保删除按钮可见
        if (removeButton) {
            removeButton.style.display = 'inline-block'; 
            console.log(`已设置 ${soundType} 删除按钮显示 (${removeButton.style.display})`);
        } else {
            console.error(`未找到删除按钮: remove-sound-${soundType}-button`);
        }
    } else {
        const baseKey = spanElement.getAttribute('data-translate-base');
        spanElement.textContent = currentLocaleData[baseKey] || baseKey; // 显示"未选择文件"
        delete spanElement.dataset.filePath; // 移除文件路径数据
        if (removeButton) {
            removeButton.style.display = 'none'; // 隐藏移除按钮
            console.log(`已隐藏 ${soundType} 删除按钮`);
        }
    }
}

// --- 加载和保存设置 ---
function loadSettings(settings) {
    currentSettings = settings; // 更新内部状态
    console.log('加载设置:', JSON.stringify(settings, null, 2));
    
    // Timers
    workDurationInput.value = settings.timers.work / 60;
    shortBreakDurationInput.value = settings.timers.shortrest / 60;
    longBreakDurationInput.value = settings.timers.longrest / 60;
    longBreakIntervalInput.value = settings.longBreakInterval;
    
    // 声音设置
    enableCompletionSoundCheckbox.checked = settings.enableCompletionSound;
    enableTickingSoundCheckbox.checked = settings.enableTickingSound;
    
    // 更新并验证自定义声音路径显示
    console.log('更新自定义声音路径显示');
    
    // 显式检查并设置音频文件的移除按钮
    const soundTypes = ['start', 'tick', 'complete'];
    soundTypes.forEach(type => {
        const soundPath = settings[`customSound${type.charAt(0).toUpperCase() + type.slice(1)}`];
        const spanElement = document.getElementById(`custom-sound-${type}-path`);
        const removeButton = document.getElementById(`remove-sound-${type}-button`);
        
        console.log(`检查音频类型 ${type}: 路径=${soundPath}`);
        
        if (soundPath && soundPath.trim() !== '') {
            // 有效的音频路径
            spanElement.textContent = path.basename(soundPath);
            spanElement.dataset.filePath = soundPath;
            
            // 强制显示移除按钮
            if (removeButton) {
                removeButton.style.display = 'inline-block';
                console.log(`强制显示 ${type} 删除按钮`);
            }
        } else {
            // 无效的音频路径
            const baseKey = spanElement.getAttribute('data-translate-base');
            spanElement.textContent = currentLocaleData[baseKey] || baseKey;
            delete spanElement.dataset.filePath;
            
            if (removeButton) {
                removeButton.style.display = 'none';
            }
        }
    });
    
    // General
    languageSelect.value = settings.language;
    launchAtLoginCheckbox.checked = settings.launchAtLogin;
    pauseAfterWorkCheckbox.checked = settings.pauseAfterWork;
    autoHideOnStartCheckbox.checked = settings.autoHideOnStart !== false; // 新增
    enableStatsCheckbox.checked = settings.enableStats !== false;
    enableHotkeysCheckbox.checked = settings.enableHotkeys !== false;
    hotkeyStartPauseInput.value = settings.hotkeyStartPause || 'Ctrl+Alt+P';
    hotkeyResetInput.value = settings.hotkeyReset || 'Ctrl+Alt+R';

    // Appearance
    loadAppearance(settings.appearance || {});
}

// 加载系统字体
async function loadSystemFonts() {
    try {
        const fonts = await ipcRenderer.invoke('get-system-fonts');
        
        // 清除现有选项（保留默认选项）
        while (fontFamilySelect.options.length > 1) {
            fontFamilySelect.remove(1);
        }
        
        // 添加系统字体选项
        fonts.forEach(font => {
            const option = document.createElement('option');
            option.value = font;
            option.textContent = font;
            fontFamilySelect.appendChild(option);
        });
        
        // 如果有选定字体，设置选择器的值
        if (currentSettings.appearance && currentSettings.appearance.fontFamily) {
            fontFamilySelect.value = currentSettings.appearance.fontFamily;
        }
    } catch (error) {
        console.error('加载系统字体失败:', error);
    }
}

ipcRenderer.invoke('get-settings-and-locale').then(({ settings, localeData }) => {
    currentLocaleData = localeData;
    loadSettings(settings); // 使用新函数加载设置
    loadSystemFonts(); // 加载系统字体
    applyTranslations(); // Apply translations after loading locale and settings
});

// --- 文件选择逻辑 ---
[customSoundStartButton, customSoundTickButton, customSoundCompleteButton].forEach(button => {
    button.addEventListener('click', async () => {
        const soundType = button.dataset.soundType;
        const filePath = await ipcRenderer.invoke('select-file');
        console.log(`文件选择结果: type=${soundType}, path=${filePath}`);
        
        if (filePath !== null) { // 检查是否选择了文件（null 表示取消）
            // 更新显示的路径和存储的设置
            const spanElement = document.getElementById(`custom-sound-${soundType}-path`);
            updateFilePathDisplay(spanElement, filePath);
            // 立即更新 currentSettings 中的对应路径，以便保存时使用
            currentSettings[`customSound${soundType.charAt(0).toUpperCase() + soundType.slice(1)}`] = filePath;
            
            // 手动设置移除按钮可见
            const removeButton = document.getElementById(`remove-sound-${soundType}-button`);
            if (removeButton) {
                removeButton.style.display = 'inline-block';
                console.log(`已手动设置 ${soundType} 删除按钮显示`);
            }
        } else {
            console.log('文件选择已取消');
        }
    });
});

// --- 新增：移除文件逻辑 ---
[removeSoundStartButton, removeSoundTickButton, removeSoundCompleteButton].forEach(button => {
    button.addEventListener('click', () => {
        const soundType = button.dataset.soundType;
        const spanElement = document.getElementById(`custom-sound-${soundType}-path`);
        // 清除设置中的路径
        currentSettings[`customSound${soundType.charAt(0).toUpperCase() + soundType.slice(1)}`] = '';
        // 更新显示
        updateFilePathDisplay(spanElement, '');
    });
});

saveButton.addEventListener('click', () => {
    // Validate inputs (basic example)
    const workVal = parseInt(workDurationInput.value, 10);
    const shortVal = parseInt(shortBreakDurationInput.value, 10);
    const longVal = parseInt(longBreakDurationInput.value, 10);
    const intervalVal = parseInt(longBreakIntervalInput.value, 10);

    if (isNaN(workVal) || workVal < 1 || isNaN(shortVal) || shortVal < 1 || isNaN(longVal) || longVal < 1 || isNaN(intervalVal) || intervalVal < 1) {
        alert('Please enter valid numbers (>= 1) for durations and interval.'); // Basic validation feedback
        return;
    }

    const newSettings = {
        timers: {
            work: workVal * 60,
            shortrest: shortVal * 60,
            longrest: longVal * 60,
        },
        longBreakInterval: intervalVal,
        enableCompletionSound: enableCompletionSoundCheckbox.checked,
        enableTickingSound: enableTickingSoundCheckbox.checked,
        // 保存自定义声音路径 (从 currentSettings 获取，因为它们在文件选择时已更新)
        customSoundStart: currentSettings.customSoundStart || '',
        customSoundTick: currentSettings.customSoundTick || '',
        customSoundComplete: currentSettings.customSoundComplete || '',
        pauseAfterWork: pauseAfterWorkCheckbox.checked, // Save new setting
        autoHideOnStart: autoHideOnStartCheckbox.checked, // 新增
        language: languageSelect.value,
        launchAtLogin: launchAtLoginCheckbox.checked,
        enableStats: enableStatsCheckbox.checked,
        enableHotkeys: enableHotkeysCheckbox.checked,
        hotkeyStartPause: hotkeyStartPauseInput.value.trim() || 'Ctrl+Alt+P',
        hotkeyReset: hotkeyResetInput.value.trim() || 'Ctrl+Alt+R',
        appearance: getAppearanceFromFields()
    };
    ipcRenderer.send('save-settings', newSettings);
    window.close();
});

cancelButton.addEventListener('click', () => {
    window.close();
});

// 确保移除按钮在DOM加载完成后就准备好
document.addEventListener('DOMContentLoaded', () => {
    // 确保所有移除按钮都正确初始化
    const removeButtons = document.querySelectorAll('.remove-sound-button');
    removeButtons.forEach(button => {
        console.log(`初始化移除按钮: ${button.id}`);
        button.style.opacity = '1';
        button.style.visibility = 'visible';
    });
});
