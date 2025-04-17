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
const languageSelect = document.getElementById('language-select');
const launchAtLoginCheckbox = document.getElementById('launch-at-login'); // New
const pauseAfterWorkCheckbox = document.getElementById('pause-after-work'); // New
const saveButton = document.getElementById('save-button');
const cancelButton = document.getElementById('cancel-button');

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
    if (filePath && filePath.trim() !== '') {
        spanElement.textContent = path.basename(filePath); // 显示文件名
        spanElement.dataset.filePath = filePath; // 存储完整路径以备后用
    } else {
        const baseKey = spanElement.getAttribute('data-translate-base');
        spanElement.textContent = currentLocaleData[baseKey] || baseKey; // 显示“未选择文件”
        delete spanElement.dataset.filePath; // 移除文件路径数据
    }
}

// --- 加载和保存设置 ---
ipcRenderer.invoke('get-settings-and-locale').then(({ settings, localeData }) => {
    currentLocaleData = localeData;
    currentSettings = settings; // 存储加载的设置
    // Timers
    workDurationInput.value = settings.timers.work / 60;
    shortBreakDurationInput.value = settings.timers.shortrest / 60;
    longBreakDurationInput.value = settings.timers.longrest / 60;
    longBreakIntervalInput.value = settings.longBreakInterval;
    // 声音设置
    enableCompletionSoundCheckbox.checked = settings.enableCompletionSound;
    enableTickingSoundCheckbox.checked = settings.enableTickingSound;
    // 更新自定义声音路径显示
    updateFilePathDisplay(customSoundStartPathSpan, settings.customSoundStart);
    updateFilePathDisplay(customSoundTickPathSpan, settings.customSoundTick);
    updateFilePathDisplay(customSoundCompletePathSpan, settings.customSoundComplete);
    // General
    languageSelect.value = settings.language;
    launchAtLoginCheckbox.checked = settings.launchAtLogin;
    pauseAfterWorkCheckbox.checked = settings.pauseAfterWork; // Load new setting

    applyTranslations(); // Apply translations after loading locale and settings
});

// --- 文件选择逻辑 ---
[customSoundStartButton, customSoundTickButton, customSoundCompleteButton].forEach(button => {
    button.addEventListener('click', async () => {
        const soundType = button.dataset.soundType;
        const filePath = await ipcRenderer.invoke('select-file');
        if (filePath !== null) { // 检查是否选择了文件（null 表示取消）
            // 更新显示的路径和存储的设置
            const spanElement = document.getElementById(`custom-sound-${soundType}-path`);
            updateFilePathDisplay(spanElement, filePath);
            // 立即更新 currentSettings 中的对应路径，以便保存时使用
            // 使用驼峰命名法匹配 main.js 中的键
            currentSettings[`customSound${soundType.charAt(0).toUpperCase() + soundType.slice(1)}`] = filePath;
        } else {
            console.log('文件选择已取消');
        }
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
        language: languageSelect.value,
        launchAtLogin: launchAtLoginCheckbox.checked
    };
    ipcRenderer.send('save-settings', newSettings);
    window.close();
});

cancelButton.addEventListener('click', () => {
    window.close();
});
