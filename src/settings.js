const { ipcRenderer } = require('electron');

// Input Elements
const workDurationInput = document.getElementById('work-duration');
const shortBreakDurationInput = document.getElementById('short-break-duration');
const longBreakDurationInput = document.getElementById('long-break-duration');
const longBreakIntervalInput = document.getElementById('long-break-interval'); // New
const enableCompletionSoundCheckbox = document.getElementById('enable-completion-sound'); // New
const enableTickingSoundCheckbox = document.getElementById('enable-ticking-sound'); // New
const languageSelect = document.getElementById('language-select');
const launchAtLoginCheckbox = document.getElementById('launch-at-login'); // New
const pauseAfterWorkCheckbox = document.getElementById('pause-after-work'); // New
const saveButton = document.getElementById('save-button');
const cancelButton = document.getElementById('cancel-button');

// Tab Elements
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

let currentLocaleData = {};

// --- Tab Switching Logic ---
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

// --- Translation Logic ---
function translateElement(element) {
    const key = element.getAttribute('data-translate');
    if (key && currentLocaleData[key]) {
        if (element.tagName === 'INPUT' && element.type === 'button' || element.tagName === 'BUTTON') {
            element.value = currentLocaleData[key]; // For input buttons
            element.textContent = currentLocaleData[key]; // For button elements
        } else {
            element.textContent = currentLocaleData[key];
        }
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
    document.querySelectorAll('[data-translate]').forEach(translateElement);
    translateElement(document.getElementById('settings-title')); // Translate window title
    translateElement(document.getElementById('settings-title-h2'));
}

// --- Load and Save Settings ---
ipcRenderer.invoke('get-settings-and-locale').then(({ settings, localeData }) => {
    currentLocaleData = localeData;
    // Timers
    workDurationInput.value = settings.timers.work / 60;
    shortBreakDurationInput.value = settings.timers.shortrest / 60;
    longBreakDurationInput.value = settings.timers.longrest / 60;
    longBreakIntervalInput.value = settings.longBreakInterval;
    // Sounds
    enableCompletionSoundCheckbox.checked = settings.enableCompletionSound;
    enableTickingSoundCheckbox.checked = settings.enableTickingSound;
    // General
    languageSelect.value = settings.language;
    launchAtLoginCheckbox.checked = settings.launchAtLogin;
    pauseAfterWorkCheckbox.checked = settings.pauseAfterWork; // Load new setting

    applyTranslations(); // Apply translations after loading locale and settings
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
