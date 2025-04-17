const { ipcRenderer } = require('electron');
const path = require('path');

// UI Elements
const timerDisplay = document.getElementById('timer-display');
const stateIndicator = document.getElementById('state-indicator');
const startPauseButton = document.getElementById('start-pause-button');
const resetButton = document.getElementById('reset-button');
const audioPlayer = document.getElementById('audioPlayer');
const container = document.querySelector('.container'); // For state classes

const sounds = {
    start: path.join(__dirname, 'Sounds', 'windup.wav'),
    tick: path.join(__dirname, 'Sounds', 'ticking.wav'),
    complete: path.join(__dirname, 'Sounds', 'ding.wav')
};

// Default settings (will be overwritten)
let timers = {
    work: 25 * 60,
    shortrest: 5 * 60,
    longrest: 15 * 60
};
let longBreakIntervalSetting = 4;
let enableCompletionSoundSetting = true;
let enableTickingSoundSetting = true;
let pauseAfterWorkSetting = false; // New setting variable

let timerInterval = null;
let remainingTime = timers.work; // Default to work time initially
let currentState = 'idle'; // 'idle', 'work', 'shortrest', 'longrest'
let isPaused = false;
let isTickingSoundPlaying = false;
let currentTimerType = 'work'; // Track which timer duration is set
let currentLocaleData = {}; // Store loaded locale data
let currentSettings = {}; // Store full settings object
let workSessionCounter = 0; // Counter for long break cycle

// --- Translation Helper ---
function translate(key, replacements = {}) {
    let translation = currentLocaleData[key] || key; // Fallback to key if not found
    for (const placeholder in replacements) {
        translation = translation.replace(`{${placeholder}}`, replacements[placeholder]);
    }
    return translation;
}

// --- Sound Handling ---
function playSound(soundPath, loop = false) {
    // Check global completion sound setting for start/complete sounds
    if (!enableCompletionSoundSetting && (soundPath === sounds.start || soundPath === sounds.complete)) {
        return; // Don't play if disabled
    }
    // Check global ticking sound setting
    if (!enableTickingSoundSetting && soundPath === sounds.tick) {
        stopSound(); // Ensure ticking stops if disabled during a session
        return; // Don't play if disabled
    }

    if (isTickingSoundPlaying && soundPath !== sounds.tick) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        isTickingSoundPlaying = false;
    }
    if (!audioPlayer.src || !audioPlayer.src.includes(path.basename(soundPath)) || audioPlayer.paused) {
        audioPlayer.src = soundPath;
        audioPlayer.loop = loop;
        audioPlayer.play().catch(e => console.error("Error playing sound:", e));
    } else if (audioPlayer.src.includes(path.basename(soundPath)) && loop && !audioPlayer.loop) {
        audioPlayer.loop = loop;
        if (audioPlayer.paused) {
            audioPlayer.play().catch(e => console.error("Error playing sound:", e));
        }
    }
    isTickingSoundPlaying = (soundPath === sounds.tick && loop);
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
    stateIndicator.className = 'state-indicator'; // Reset class
    container.className = 'container'; // Reset class

    if (currentState !== 'idle') {
        stateKey = `state_${currentState}`;
        stateText = translate(stateKey);
        if (isPaused) {
            stateText += translate('state_paused');
        }
        stateIndicator.classList.add(currentState); // Add class like 'work', 'shortrest'
        container.classList.add(currentState);
    }
    stateIndicator.textContent = stateText;
    stateIndicator.setAttribute('data-translate-base', stateKey); // Store base key for updates

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
}

function startTimer(type) {
    stopTimer(false);

    currentState = type;
    currentTimerType = type;
    remainingTime = timers[type];
    isPaused = false;

    console.log(`Starting timer: ${type}, Duration: ${remainingTime}s, Session: ${workSessionCounter}`);

    // Only play start sound for work sessions and if enabled
    if (type === 'work' && enableCompletionSoundSetting) {
        playSound(sounds.start);
    }

    // Start ticking sound after a delay ONLY for work sessions and if enabled
    setTimeout(() => {
        if (currentState === 'work' && !isPaused && enableTickingSoundSetting) {
            playSound(sounds.tick, true);
        }
    }, 1000); // Delay ticking sound slightly

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
            console.log('Timer paused');
        } else {
            console.log('Timer resumed');
            // Only resume ticking sound for work sessions and if enabled
            if (currentState === 'work' && enableTickingSoundSetting) {
                playSound(sounds.tick, true);
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
            // 1. 停止当前的 Interval
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            // 2. 如果滴答声在播放，停止它
            if (isTickingSoundPlaying) {
                stopSound(); // isTickingSoundPlaying 会被设为 false
            }

            let nextStateType = 'idle';
            let playCompleteSound = false; // 用于标记是否需要播放完成音效

            if (currentState === 'work') {
                // 标记需要播放完成音效（如果设置允许）
                if (enableCompletionSoundSetting) {
                    playCompleteSound = true;
                }
                workSessionCounter++;
                console.log(`Work session ${workSessionCounter} completed.`);

                // 3. 检查是否设置了工作后暂停
                if (pauseAfterWorkSetting) {
                    console.log('Pausing after work session as per setting.');
                    isPaused = true; // 设置暂停状态
                    // 确定下一个计时器类型（用于显示）
                    if (workSessionCounter >= longBreakIntervalSetting) {
                        currentTimerType = 'longrest';
                    } else {
                        currentTimerType = 'shortrest';
                    }
                    remainingTime = timers[currentTimerType]; // 设置剩余时间为下一个计时器的时长
                    // currentState 保持 'work' 直到用户手动继续或重置
                    updateDisplay(); // 更新显示为暂停状态

                    // 在返回前播放完成音效
                    if (playCompleteSound) {
                        playSound(sounds.complete);
                    }

                    // 发送通知 (如果启用)
                    if (currentSettings.enableNotifications) {
                        ipcRenderer.send('show-notification', {
                            title: translate('notification_work_complete_title'),
                            body: translate('notification_work_complete_body', { next_state: translate(`state_${currentTimerType}`) })
                        });
                    }
                    return; // 退出 Interval 回调，等待用户操作
                }

                // 4. 如果不暂停，确定下一个状态（自动开始休息）
                if (workSessionCounter >= longBreakIntervalSetting) {
                    nextStateType = 'longrest';
                    console.log('Starting long break.');
                } else {
                    nextStateType = 'shortrest';
                    console.log('Starting short break.');
                }
                // 发送通知 (如果启用)
                if (currentSettings.enableNotifications) {
                    ipcRenderer.send('show-notification', {
                        title: translate('notification_work_complete_title'),
                        body: translate('notification_work_complete_body_auto', { next_state: translate(`state_${nextStateType}`) })
                    });
                }

            } else { // 当前是休息状态 ('shortrest' or 'longrest')
                // 休息结束，不播放完成音效
                if (currentState === 'longrest') {
                    workSessionCounter = 0; // 长休息结束后重置计数器
                    console.log('Long break finished. Resetting work session counter.');
                } else {
                    console.log('Short break finished.');
                }
                nextStateType = 'work'; // 下一个状态是工作
                console.log('Starting work session.');
                // 发送通知 (如果启用)
                if (currentSettings.enableNotifications) {
                    ipcRenderer.send('show-notification', {
                        title: translate('notification_break_complete_title'),
                        body: translate('notification_break_complete_body')
                    });
                }
            }

            // 5. 播放工作完成音效（如果标记了）
            //    此时 Interval 已停止，滴答声已停止，不会被立即中断
            if (playCompleteSound) {
                playSound(sounds.complete);
            }

            // 6. 重置暂停状态（以防万一）并准备启动下一个计时器
            isPaused = false; // 确保不是暂停状态

            // 7. 延迟后自动启动下一个计时器
            setTimeout(() => {
                // 确保在延迟期间没有其他操作改变状态
                if (!isPaused && currentState !== 'idle') {
                     startTimer(nextStateType);
                } else if (currentState === 'idle') {
                    // 如果在延迟期间被重置了，则不自动启动
                    console.log('Timer was reset during transition delay. Not starting next state.');
                } else {
                     // 如果在延迟期间被暂停了 (理论上不应该发生在此流程中，除非有其他代码干预)
                     console.log('Timer was paused during transition delay. Not starting next state automatically.');
                }
            }, 1500); // 短暂延迟
        }
    }, 1000);
}

function resetCurrentTimer() {
    stopTimer(true);
    console.log('Timer reset.');
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

// --- Event Listeners ---
startPauseButton.addEventListener('click', togglePauseResume);
resetButton.addEventListener('click', resetCurrentTimer);

// --- IPC Listeners ---
ipcRenderer.on('initialize-data', (event, { settings, localeData }) => {
    console.log('Received initial data:', settings);
    currentLocaleData = localeData;
    currentSettings = settings; // Store the full settings object
    timers = settings.timers;
    longBreakIntervalSetting = settings.longBreakInterval;
    enableCompletionSoundSetting = settings.enableCompletionSound;
    enableTickingSoundSetting = settings.enableTickingSound;
    pauseAfterWorkSetting = settings.pauseAfterWork;
    remainingTime = timers[currentTimerType];

    applyTranslations();
    updateDisplay();
});

ipcRenderer.on('settings-updated', (event, { settings, localeData }) => {
    console.log('Received settings update:', settings);
    currentLocaleData = localeData;
    currentSettings = settings; // Store the full settings object
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

    applyTranslations();
    updateDisplay();
});
