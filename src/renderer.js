const { ipcRenderer } = require('electron');
const path = require('path');

// UI Elements
const timerDisplay = document.getElementById('timer-display');
const stateIndicator = document.getElementById('state-indicator');
const startPauseButton = document.getElementById('start-pause-button');
const resetButton = document.getElementById('reset-button');
const audioPlayer = document.getElementById('audioPlayer');
const container = document.querySelector('.container'); // For state classes

const sounds = { // 默认声音
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
function playSound(soundType, loop = false) { // 修改参数为 soundType: 'start', 'tick', 'complete'
    let soundPath;
    // 检查是否有自定义声音路径
    switch (soundType) {
        case 'start':
            // 使用驼峰命名法匹配 main.js 中的键
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

    // 检查全局完成音效设置（针对开始/完成声音）
    if (!enableCompletionSoundSetting && (soundType === 'start' || soundType === 'complete')) {
        return; // 如果禁用则不播放
    }
    // 检查全局滴答声设置
    if (!enableTickingSoundSetting && soundType === 'tick') {
        stopSound(); // 如果在会话期间禁用，确保滴答声停止
        return; // 如果禁用则不播放
    }

    // 检查文件路径是否为空或无效（基本检查）
    if (!soundPath || typeof soundPath !== 'string' || soundPath.trim() === '') {
        console.error(`Invalid or empty sound path for type: ${soundType}`);
        return;
    }

    if (isTickingSoundPlaying && soundType !== 'tick') {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        isTickingSoundPlaying = false;
    }

    // 使用 file:// 协议确保本地文件路径正确加载
    // 注意：需要将反斜杠替换为正斜杠
    const audioSrc = `file://${soundPath.replace(/\\/g, '/')}`;

    // 检查是否需要更新 src
    // 使用 decodeURIComponent 来处理可能存在的 URL 编码字符
    const currentSrcDecoded = audioPlayer.src ? decodeURIComponent(audioPlayer.src) : '';
    const newSrcDecoded = decodeURIComponent(audioSrc);

    if (currentSrcDecoded !== newSrcDecoded || audioPlayer.paused) {
        try {
            console.log(`Playing sound: ${soundType} from ${audioSrc}`); // 调试信息
            audioPlayer.src = audioSrc;
            audioPlayer.loop = loop;
            // 等待 canplay 事件可能更可靠，但 play() 通常会处理加载
            audioPlayer.play().catch(e => console.error(`播放声音时出错 (${soundPath}):`, e));
        } catch (e) {
             console.error(`设置音频源时出错 (${soundPath}):`, e);
        }
    } else if (currentSrcDecoded === newSrcDecoded && loop !== audioPlayer.loop) {
        // 如果 src 相同但 loop 不同
        audioPlayer.loop = loop;
        if (audioPlayer.paused) { // 如果因为某种原因暂停了，重新播放
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

    console.log(`启动计时器: ${type}, 时长: ${remainingTime}s, 会话: ${workSessionCounter}`);

    // 仅在工作会话开始且启用完成音效时播放开始声音
    if (type === 'work' && enableCompletionSoundSetting) {
        playSound('start'); // 使用 'start' 类型
    }

    // 延迟后启动滴答声，仅限工作会话且启用时
    setTimeout(() => {
        if (currentState === 'work' && !isPaused && enableTickingSoundSetting) {
            playSound('tick', true); // 使用 'tick' 类型
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
            console.log('计时器已暂停');
        } else {
            console.log('计时器已恢复');
            // 仅在工作会话且启用时恢复滴答声
            if (currentState === 'work' && enableTickingSoundSetting) {
                playSound('tick', true); // 使用 'tick' 类型
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
                stopSound();
            }

            let nextStateType = 'idle';
            let playCompleteSound = false;

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
                    isPaused = true;
                    // 确定下一个计时器类型（用于显示）
                    if (workSessionCounter >= longBreakIntervalSetting) {
                        currentTimerType = 'longrest';
                    } else {
                        currentTimerType = 'shortrest';
                    }
                    remainingTime = timers[currentTimerType];
                    updateDisplay();

                    // 在返回前播放完成音效
                    if (playCompleteSound) {
                        playSound('complete'); // 使用 'complete' 类型
                    }

                    // 发送通知 (如果启用)
                    if (currentSettings.enableNotifications) {
                        ipcRenderer.send('show-notification', {
                            title: translate('notification_work_complete_title'), // 可以考虑也自定义这个通知
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
                        title: translate('notification_work_complete_title'), // 可以考虑也自定义这个通知
                        body: translate('notification_work_complete_body_auto', { next_state: translate(`state_${nextStateType}`) })
                    });
                }

            } else { // 当前是休息状态 ('shortrest' or 'longrest')
                // ... (休息结束逻辑，不需要播放完成音效) ...
                if (currentState === 'longrest') {
                    workSessionCounter = 0;
                    console.log('Long break finished. Resetting work session counter.');
                } else {
                    console.log('Short break finished.');
                }
                nextStateType = 'work';
                console.log('Starting work session.');
                // 发送通知 (如果启用)
                if (currentSettings.enableNotifications) {
                    ipcRenderer.send('show-notification', {
                        title: translate('notification_break_complete_title'), // 可以考虑也自定义这个通知
                        body: translate('notification_break_complete_body')
                    });
                }
            }

            // 5. 播放工作完成音效（如果标记了）
            if (playCompleteSound) {
                playSound('complete'); // 使用 'complete' 类型
            }

            // 6. 重置暂停状态（以防万一）并准备启动下一个计时器
            isPaused = false;

            // 7. 延迟后自动启动下一个计时器
            setTimeout(() => {
                // ... (确保状态未改变) ...
                if (!isPaused && currentState !== 'idle') {
                     startTimer(nextStateType);
                } else if (currentState === 'idle') {
                    console.log('Timer was reset during transition delay. Not starting next state.');
                } else {
                     console.log('Timer was paused during transition delay. Not starting next state automatically.');
                }
            }, 1500);
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
    console.log('收到初始数据:', settings);
    currentLocaleData = localeData;
    currentSettings = settings; // 存储完整的设置对象
    timers = settings.timers;
    longBreakIntervalSetting = settings.longBreakInterval;
    enableCompletionSoundSetting = settings.enableCompletionSound;
    enableTickingSoundSetting = settings.enableTickingSound;
    pauseAfterWorkSetting = settings.pauseAfterWork;
    // enableNotificationsSetting = settings.enableNotifications; // 确保加载通知设置
    remainingTime = timers[currentTimerType];

    applyTranslations();
    updateDisplay();
});

ipcRenderer.on('settings-updated', (event, { settings, localeData }) => {
    console.log('收到设置更新:', settings);
    currentLocaleData = localeData;
    currentSettings = settings; // 存储完整的设置对象
    const oldTimers = { ...timers };
    timers = settings.timers;
    longBreakIntervalSetting = settings.longBreakInterval;
    enableCompletionSoundSetting = settings.enableCompletionSound;
    enableTickingSoundSetting = settings.enableTickingSound;
    pauseAfterWorkSetting = settings.pauseAfterWork;
    // enableNotificationsSetting = settings.enableNotifications; // 确保更新通知设置

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
