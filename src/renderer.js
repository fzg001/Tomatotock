const { ipcRenderer } = require('electron');
const path = require('path');

// UI Elements
const timerDisplay = document.getElementById('timer-display');
const stateIndicator = document.getElementById('state-indicator');
const startPauseButton = document.getElementById('start-pause-button');
const resetButton = document.getElementById('reset-button');
const audioPlayer = document.getElementById('audioPlayer');
const container = document.querySelector('.container'); // For state classes

// Default settings (will be overwritten)
let timers = {
    work: 25 * 60,
    shortrest: 5 * 60,
    longrest: 15 * 60
};
let longBreakIntervalSetting = 4;
let enableCompletionSoundSetting = true;
let enableTickingSoundSetting = true;
let pauseAfterWorkSetting = false;
let miniCardMode = false; // 新增：小卡片模式状态

let timerInterval = null;
let remainingTime = timers.work;
let currentState = 'idle';
let isPaused = false;
let isTickingSoundPlaying = false;
let currentTimerType = 'work';
let currentLocaleData = {};
let currentSettings = {};
let workSessionCounter = 0;

// --- Translation Helper ---
function translate(key, replacements = {}) {
    let translation = currentLocaleData[key] || key;
    for (const placeholder in replacements) {
        translation = translation.replace(`{${placeholder}}`, replacements[placeholder]);
    }
    return translation;
}

// --- Sound Handling ---
function playSound(soundType, loop = false) {
    let soundPath;
    switch (soundType) {
        case 'start':
            soundPath = currentSettings.customSoundStart || sounds.start;
            break;
        case 'tick':
            soundPath = currentSettings.customSoundTick || sounds.tick;
            break;
        case 'complete':
            soundPath = currentSettings.customSoundComplete || sounds.complete;
            break;
        default:
            console.error('Unknown sound type:', soundType);
            return;
    }

    if (!enableCompletionSoundSetting && (soundType === 'start' || soundType === 'complete')) {
        return;
    }
    if (!enableTickingSoundSetting && soundType === 'tick') {
        stopSound();
        return;
    }

    if (!soundPath || typeof soundPath !== 'string' || soundPath.trim() === '') {
        console.error(`Invalid or empty sound path for type: ${soundType}`);
        return;
    }

    if (isTickingSoundPlaying && soundType !== 'tick') {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        isTickingSoundPlaying = false;
    }

    const audioSrc = `file://${soundPath.replace(/\\/g, '/')}`;
    const currentSrcDecoded = audioPlayer.src ? decodeURIComponent(audioPlayer.src) : '';
    const newSrcDecoded = decodeURIComponent(audioSrc);

    if (currentSrcDecoded !== newSrcDecoded || audioPlayer.paused) {
        try {
            audioPlayer.src = audioSrc;
            audioPlayer.loop = loop;
            audioPlayer.play().catch(e => console.error(`播放声音时出错 (${soundPath}):`, e));
        } catch (e) {
            console.error(`设置音频源时出错 (${soundPath}):`, e);
        }
    } else if (currentSrcDecoded === newSrcDecoded && loop !== audioPlayer.loop) {
        audioPlayer.loop = loop;
        if (audioPlayer.paused) {
            audioPlayer.play().catch(e => console.error(`播放声音时出错 (${soundPath}):`, e));
        }
    }
    isTickingSoundPlaying = (soundType === 'tick' && loop);
}

function stopSound() {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    isTickingSoundPlaying = false;
}

// --- Timer Logic ---
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function updateDisplay() {
    timerDisplay.textContent = formatTime(remainingTime);

    let stateText = translate('state_idle');
    let stateKey = 'state_idle';
    stateIndicator.className = 'state-indicator';
    container.className = 'container';

    if (currentState !== 'idle') {
        stateKey = `state_${currentState}`;
        stateText = translate(stateKey);
        if (isPaused) {
            stateText += translate('state_paused');
        }
        stateIndicator.classList.add(currentState);
        container.classList.add(currentState);
    }
    stateIndicator.textContent = stateText;
    stateIndicator.setAttribute('data-translate-base', stateKey);

    if (currentState === 'idle') {
        startPauseButton.textContent = translate('button_start');
        startPauseButton.setAttribute('data-translate-base', 'button_start');
        startPauseButton.classList.remove('active');
    } else {
        const buttonKey = isPaused ? 'button_resume' : 'button_pause';
        startPauseButton.textContent = translate(buttonKey);
        startPauseButton.setAttribute('data-translate-base', buttonKey);
        startPauseButton.classList.add('active');
    }
    resetButton.textContent = translate('button_reset');

    ipcRenderer.send('timer-update', { state: (isPaused || currentState === 'idle') ? 'idle' : currentState, timeLeft: remainingTime });
}

function stopTimer(goIdle = true) {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    stopSound();
    isPaused = false;
    if (goIdle) {
        currentState = 'idle';
        remainingTime = timers[currentTimerType];
        workSessionCounter = 0;
    }
    updateDisplay();
    // 主动释放引用
    // 不需要清理 UI 元素引用（页面不销毁），但可以清理临时变量
}

function startTimer(type) {
    stopTimer(false);

    currentState = type;
    currentTimerType = type;
    remainingTime = timers[type];
    isPaused = false;

    if (type === 'work') {
        if (enableCompletionSoundSetting) {
            playSound('start');
        }
    }

    // 如果开启了"开始后自动隐藏"选项，通知主进程隐藏窗口
    if (currentSettings.autoHideOnStart) {
        ipcRenderer.send('auto-hide-window');
    }

    if (currentSettings.enableNotifications) {
        if (type === 'work') {
            ipcRenderer.send('show-notification', {
                title: translate('notification_start_work_title'),
                body: translate('notification_start_work_body')
            });
        } else if (type === 'shortrest') {
            ipcRenderer.send('show-notification', {
                title: translate('notification_start_break_title'),
                body: translate('notification_start_break_body', { break_type: translate('state_shortrest') })
            });
        } else if (type === 'longrest') {
            ipcRenderer.send('show-notification', {
                title: translate('notification_long_break_title'),
                body: translate('notification_long_break_body')
            });
        }
    }

    setTimeout(() => {
        if (currentState === 'work' && !isPaused && enableTickingSoundSetting) {
            playSound('tick', true);
        }
    }, 1000);

    startInterval();
    updateDisplay();
}

function togglePauseResume() {
    if (currentState === 'idle') {
        currentTimerType = 'work';
        workSessionCounter = 0;
        startTimer(currentTimerType);
    } else {
        isPaused = !isPaused;
        if (isPaused) {
            if (timerInterval) clearInterval(timerInterval);
            stopSound();
        } else {
            if (currentState === 'work' && enableTickingSoundSetting) {
                playSound('tick', true);
            }
            startInterval();
        }
        updateDisplay();
    }
}

function startInterval() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (isPaused) return;

        remainingTime--;
        updateDisplay();

        if (remainingTime <= 0) {
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            if (isTickingSoundPlaying) {
                stopSound();
            }

            let nextStateType = 'idle';
            let playCompleteSound = false;

            if (currentState === 'work') {
                if (enableCompletionSoundSetting) {
                    playCompleteSound = true;
                }
                workSessionCounter++;

                if (pauseAfterWorkSetting) {
                    isPaused = true;
                    if (workSessionCounter >= longBreakIntervalSetting) {
                        currentTimerType = 'longrest';
                    } else {
                        currentTimerType = 'shortrest';
                    }
                    remainingTime = timers[currentTimerType];
                    updateDisplay();

                    if (playCompleteSound) {
                        playSound('complete');
                    }
                    return;
                }

                if (workSessionCounter >= longBreakIntervalSetting) {
                    nextStateType = 'longrest';
                } else {
                    nextStateType = 'shortrest';
                }

                if (currentSettings.enableStats) {
                    ipcRenderer.send('work-session-complete', { remark: null });
                }
            } else {
                if (currentState === 'longrest') {
                    workSessionCounter = 0;
                }
                nextStateType = 'work';
            }

            if (playCompleteSound) {
                playSound('complete');
            }

            isPaused = false;

            setTimeout(() => {
                if (!isPaused && currentState !== 'idle') {
                    startTimer(nextStateType);
                }
            }, 1500);
        }
    }, 1000);
}

function resetCurrentTimer() {
    stopTimer(true);
    updateDisplay();
}

// --- Apply Translations to UI ---
function applyTranslations() {
    resetButton.textContent = translate('button_reset');
    const startPauseBaseKey = startPauseButton.getAttribute('data-translate-base') || 'button_start';
    startPauseButton.textContent = translate(startPauseBaseKey);
    const stateIndicatorBaseKey = stateIndicator.getAttribute('data-translate-base') || 'state_idle';
    stateIndicator.textContent = translate(stateIndicatorBaseKey) + (currentState !== 'idle' && isPaused ? translate('state_paused') : '');
}

// --- Apply Appearance to UI ---
function applyAppearance(appearance) {
    const ap = {
        fontFamily: 'default',
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
        btnActiveBorder: '#c9302c',
        ...(appearance || {})
    };
    const root = document.documentElement;
    
    // 应用字体设置
    if (ap.fontFamily && ap.fontFamily !== 'default') {
        root.style.setProperty('--font-family', `"${ap.fontFamily}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`);
    } else {
        root.style.setProperty('--font-family', `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`);
    }
    
    root.style.setProperty('--card-bg', ap.cardBg);
    root.style.setProperty('--card-opacity', ap.cardOpacity);
    root.style.setProperty('--timer-color', ap.timerColor);
    root.style.setProperty('--idle-color', ap.idleColor);
    root.style.setProperty('--work-color', ap.workColor);
    root.style.setProperty('--shortrest-color', ap.shortrestColor);
    root.style.setProperty('--longrest-color', ap.longrestColor);
    root.style.setProperty('--btn-bg', ap.btnBg);
    root.style.setProperty('--btn-hover-bg', ap.btnHoverBg);
    root.style.setProperty('--btn-active-bg', ap.btnActiveBg);
    root.style.setProperty('--btn-color', ap.btnColor);
    root.style.setProperty('--btn-active-color', ap.btnActiveColor);
    root.style.setProperty('--btn-active-border', ap.btnActiveBorder);
}

// --- 新增：切换小卡片模式 ---
function toggleMiniCardMode(enable) {
    miniCardMode = enable;
    if (enable) {
        document.body.classList.add('mini-card-mode');
    } else {
        document.body.classList.remove('mini-card-mode');
    }
    // 通知主进程调整窗口大小
    ipcRenderer.send('toggle-mini-card', enable);
}

// --- Event Listeners ---
// 只绑定一次，避免重复绑定
if (!window._tomatotockEventBound) {
    startPauseButton.addEventListener('click', togglePauseResume);
    resetButton.addEventListener('click', resetCurrentTimer);
    
    window._tomatotockEventBound = true;
}

// 页面卸载时移除事件监听，释放资源
window.addEventListener('beforeunload', () => {
    startPauseButton.removeEventListener('click', togglePauseResume);
    resetButton.removeEventListener('click', resetCurrentTimer);
    
    // 释放音频资源
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.src = '';
    }
});

// 音频播放结束时释放资源
if (audioPlayer) {
    audioPlayer.addEventListener('ended', () => {
        audioPlayer.src = '';
    });
}

// --- IPC Listeners ---
ipcRenderer.on('initialize-data', (event, { settings, localeData }) => {
    currentLocaleData = localeData;
    currentSettings = settings;
    timers = settings.timers;
    longBreakIntervalSetting = settings.longBreakInterval;
    enableCompletionSoundSetting = settings.enableCompletionSound;
    enableTickingSoundSetting = settings.enableTickingSound;
    pauseAfterWorkSetting = settings.pauseAfterWork;
    remainingTime = timers[currentTimerType];

    // 新增：应用小卡片模式设置
    if (settings.miniCardMode) {
        toggleMiniCardMode(true);
    }
    
    applyTranslations();
    applyAppearance(settings.appearance);
    updateDisplay();
});

ipcRenderer.on('settings-updated', (event, { settings, localeData }) => {
    currentLocaleData = localeData;
    currentSettings = settings;
    const oldTimers = { ...timers };
    timers = settings.timers;
    longBreakIntervalSetting = settings.longBreakInterval;
    enableCompletionSoundSetting = settings.enableCompletionSound;
    enableTickingSoundSetting = settings.enableTickingSound;
    pauseAfterWorkSetting = settings.pauseAfterWork;

    if (currentState === 'idle' || isPaused) {
        if (oldTimers[currentTimerType] !== timers[currentTimerType]) {
            remainingTime = timers[currentTimerType];
        }
    }
    if (!enableTickingSoundSetting && isTickingSoundPlaying) {
        stopSound();
    }

    // 新增：更新小卡片模式
    toggleMiniCardMode(settings.miniCardMode);
    
    applyTranslations();
    applyAppearance(settings.appearance);
    updateDisplay();
});

// 快捷键事件监听
ipcRenderer.on('hotkey-start-pause', () => {
    togglePauseResume();
});
ipcRenderer.on('hotkey-reset', () => {
    resetCurrentTimer();
});

// 新增：切换小卡片模式的IPC监听
ipcRenderer.on('toggle-mini-card-mode', (event, enable) => {
    toggleMiniCardMode(enable);
});
