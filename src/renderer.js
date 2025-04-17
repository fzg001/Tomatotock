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
    if (audioPlayer.src !== soundPath || audioPlayer.paused) {
        audioPlayer.src = soundPath;
        audioPlayer.loop = loop;
        audioPlayer.play().catch(e => console.error("Error playing sound:", e));
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

    playSound(sounds.start);
    setTimeout(() => {
        if (currentState !== 'idle' && !isPaused) {
            playSound(sounds.tick, true);
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
            console.log('Timer paused');
        } else {
            console.log('Timer resumed');
            playSound(sounds.tick, true);
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
            playSound(sounds.complete);

            let nextStateType = 'idle';

            if (currentState === 'work') {
                workSessionCounter++;
                console.log(`Work session ${workSessionCounter} completed.`);

                // Check if we should pause instead of auto-starting break
                if (pauseAfterWorkSetting) {
                    console.log('Pausing after work session as per setting.');
                    stopTimer(false); // Stop interval, keep state for display
                    isPaused = true; // Set paused flag
                    // Determine next state but don't start it
                    if (workSessionCounter >= longBreakIntervalSetting) {
                        currentTimerType = 'longrest';
                        workSessionCounter = 0; // Reset counter as the *next* state is long break
                    } else {
                        currentTimerType = 'shortrest';
                    }
                    remainingTime = timers[currentTimerType]; // Set time for next state display
                    updateDisplay(); // Update UI to show paused state and next timer duration
                    return; // Exit interval callback
                }

                // Original auto-start logic (if not pausing)
                if (workSessionCounter >= longBreakIntervalSetting) {
                    nextStateType = 'longrest';
                    console.log('Starting long break.');
                    workSessionCounter = 0;
                } else {
                    nextStateType = 'shortrest';
                    console.log('Starting short break.');
                }
            } else {
                nextStateType = 'work';
                console.log('Starting work session.');
            }

            stopTimer(false);

            // Automatically start the next timer (only if not paused above)
            setTimeout(() => {
                startTimer(nextStateType);
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
    console.log('Received initial data:', settings);
    currentLocaleData = localeData;
    timers = settings.timers;
    longBreakIntervalSetting = settings.longBreakInterval;
    enableCompletionSoundSetting = settings.enableCompletionSound;
    enableTickingSoundSetting = settings.enableTickingSound;
    pauseAfterWorkSetting = settings.pauseAfterWork; // Load new setting
    remainingTime = timers[currentTimerType];

    applyTranslations();
    updateDisplay();
});

ipcRenderer.on('settings-updated', (event, { settings, localeData }) => {
    console.log('Received settings update:', settings);
    currentLocaleData = localeData;
    const oldTimers = { ...timers };
    timers = settings.timers;
    longBreakIntervalSetting = settings.longBreakInterval;
    enableCompletionSoundSetting = settings.enableCompletionSound;
    enableTickingSoundSetting = settings.enableTickingSound;
    pauseAfterWorkSetting = settings.pauseAfterWork; // Update new setting

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
