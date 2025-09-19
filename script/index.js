if (!localStorage.getItem('setupCompleted')) {
    window.location.href = '/setup.html';
}

// Global state
let chapters = {};
let dailyTasks = {};
let routine = {};
let currentTask = '';
let activeTab = 'Physics';
let expandedNotes = {};
let syncStatus = 'idle';
let githubToken = localStorage.getItem('github-token') || '';
let gistId = localStorage.getItem('gist-id') || '';
let lastSync = localStorage.getItem('last-sync') || '';
let currentPinInput = '';
let pendingConfirmationAction = null;
let hasPinConfirmation = false;
let qrCanvas = null;
let autoSyncEnabled = localStorage.getItem('autoSyncEnabled') === 'true' || false;

// Date constants
const startDate = new Date('2025-09-15');
const endDate = new Date('2026-09-30');

// Lockscreen functions
async function hashPin(pin) {
    const enc = new TextEncoder();
    const data = enc.encode(pin);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function checkLockscreen() {
    if (localStorage.getItem('setupCompleted') !== 'true') {
        window.location.href = '/setup.html';
    } else if (localStorage.getItem('pinHash') && localStorage.getItem('remember') !== 'true') {
        document.getElementById('lockscreenFull').classList.remove('hidden');
        document.getElementById('mainContainer').style.display = 'none';
    } else {
        document.getElementById('lockscreenFull').classList.add('hidden');
        document.getElementById('mainContainer').style.display = 'flex';
        init();
    }
}

function enterPinDigit(digit) {
    if (currentPinInput.length < 4) {
        currentPinInput += digit;
        updatePinDisplay();
        document.getElementById('pinError').classList.add('hidden');
    }
}

function clearPin() {
    currentPinInput = '';
    updatePinDisplay();
    document.getElementById('pinError').classList.add('hidden');
}

function updatePinDisplay() {
    for (let i = 1; i <= 4; i++) {
        const digitSpan = document.getElementById(`pinDigit${i}`);
        if (i <= currentPinInput.length) {
            digitSpan.textContent = '●';
            digitSpan.classList.add('filled');
        } else {
            digitSpan.textContent = '';
            digitSpan.classList.remove('filled');
        }
    }
}

async function submitPin() {
    if (currentPinInput.length !== 4) {
        document.getElementById('pinError').classList.remove('hidden');
        document.getElementById('pinError').textContent = 'Enter a 4-digit PIN';
        return;
    }
    const hashedPin = await hashPin(currentPinInput);
    if (hashedPin === localStorage.getItem('pinHash')) {
        document.getElementById('lockscreenFull').classList.add('hidden');
        document.getElementById('mainContainer').style.display = 'flex';
        if (document.getElementById('rememberMe').checked) {
            localStorage.setItem('remember', 'true');
        }
        currentPinInput = '';
        updatePinDisplay();
        init();
    } else {
        document.getElementById('pinError').classList.remove('hidden');
        document.getElementById('pinError').textContent = 'Incorrect PIN';
        currentPinInput = '';
        updatePinDisplay();
    }
}

// Cloud sync functions
async function fetchFromCloud() {
    if (!githubToken || !gistId) {
        return false;
    }
    
    try {
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            console.warn('Failed to fetch from cloud:', response.status, response.statusText);
            return false;
        }

        const gistData = await response.json();
        const fileContent = gistData.files['hsc-study-tracker.json']?.content;
        
        if (fileContent) {
            const cloudData = JSON.parse(fileContent);
            
            // Only update if cloud data is newer or if no local data exists
            const cloudTimestamp = new Date(cloudData.lastUpdated || 0);
            const localTimestamp = new Date(localStorage.getItem('lastUpdated') || 0);
            
            if (cloudTimestamp > localTimestamp || !localStorage.getItem('hsc-study-tracker-v2')) {
                chapters = cloudData.chapters || {};
                dailyTasks = cloudData.dailyTasks || {};
                saveData();
                localStorage.setItem('lastUpdated', cloudData.lastUpdated || new Date().toISOString());
                console.log('Synced data from cloud');
                return true;
            }
        }
    } catch (error) {
        console.warn('Error fetching from cloud:', error);
    }
    
    return false;
}

async function syncToCloud() {
    if (!githubToken || !gistId) {
        showToast('Missing token or Gist ID', 'error');
        return false;
    }
    
    syncStatus = 'syncing';
    updateSyncStatus();
    
    if (document.getElementById('syllabusLoading')) {
        document.getElementById('syllabusLoading').classList.remove('hidden');
    }
    
    try {
        const data = {
            chapters,
            dailyTasks,
            lastUpdated: new Date().toISOString(),
            device: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop'
        };

        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                files: {
                    'hsc-study-tracker.json': {
                        content: JSON.stringify(data, null, 2)
                    }
                }
            })
        });

        if (response.ok) {
            syncStatus = 'success';
            showToast('Sync successful', 'success');
            const syncTime = new Date().toLocaleString();
            lastSync = syncTime;
            localStorage.setItem('last-sync', syncTime);
            localStorage.setItem('lastUpdated', data.lastUpdated);
            
            setTimeout(() => {
                syncStatus = 'idle';
                updateSyncStatus();
            }, 2000);
            
            return true;
        } else {
            throw new Error(`${response.status} ${response.statusText}`);
        }
    } catch (error) {
        syncStatus = 'error';
        showToast(`Sync failed: ${error.message}`, 'error');
        setTimeout(() => {
            syncStatus = 'idle';
            updateSyncStatus();
        }, 3000);
        return false;
    } finally {
        if (document.getElementById('syllabusLoading')) {
            document.getElementById('syllabusLoading').classList.add('hidden');
        }
        updateSyncStatus();
    }
}

// Auto-sync after any data changes
function saveDataAndSync() {
    saveData();
    localStorage.setItem('lastUpdated', new Date().toISOString());
    
    // Auto-sync if configured
    if (autoSyncEnabled && githubToken && gistId) {
        // Debounce auto-sync to avoid too many requests
        clearTimeout(window.autoSyncTimeout);
        window.autoSyncTimeout = setTimeout(() => {
            syncToCloud();
        }, 2000);
    }
}

// QR Export/Import
function exportGistQR() {
    if (typeof QRCode === 'undefined') {
        console.error('QRCode library not loaded');
        showToast('QR code library not loaded', 'error');
        return;
    }

    const pinHash = localStorage.getItem('pinHash') || '';
    const data = JSON.stringify({ gistId, pinHash });
    if (!gistId && !pinHash) {
        console.error('No data to encode: gistId and pinHash are empty');
        showToast('No data to encode in QR code', 'error');
        return;
    }
    console.log('Generating QR code for data:', data);

    const qrContainer = document.getElementById('qrCodeContainer');
    qrContainer.innerHTML = '';
    
    try {
        new QRCode(qrContainer, {
            text: data,
            width: 256,
            height: 256,
            colorDark: '#000000',
            colorLight: '#FFFFFF',
            correctLevel: QRCode.CorrectLevel.H
        });
        qrCanvas = qrContainer.querySelector('canvas');
        if (!qrCanvas) {
            console.error('No canvas generated by QRCode');
            showToast('Failed to generate QR code: No canvas created', 'error');
            return;
        }
        console.log('QR code generated successfully');
        document.getElementById('qrExportModal').classList.remove('hidden');
        // Auto-download QR code
        const link = document.createElement('a');
        link.href = qrCanvas.toDataURL('image/png');
        link.download = 'syllabuspulse-gist-qr.png';
        link.click();
    } catch (err) {
        console.error('Error in QR code generation:', err);
        showToast(`Error generating QR code: ${err.message}`, 'error');
    }
}

function importGistQR(event, fromWizard = false) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, canvas.width, canvas.height);
                if (code) {
                    try {
                        const data = JSON.parse(code.data);
                        gistId = data.gistId || '';
                        const pinHash = data.pinHash || '';
                        localStorage.setItem('gist-id', gistId);
                        localStorage.setItem('pinHash', pinHash);
                        if (!fromWizard) {
                            document.getElementById('gistId').value = gistId;
                        } else {
                            localStorage.setItem('setupCompleted', 'true');
                            document.getElementById('setupWizard').classList.add('hidden');
                            document.getElementById('mainContainer').style.display = 'flex';
                            init();
                        }
                        updateSyncStatus();
                        showToast('Gist and PIN imported successfully', 'success');
                        // Fetch data from cloud after importing Gist
                        fetchFromCloud().then(() => {
                            updateProgress();
                            updateHeroTasks();
                            renderChapters();
                        });
                    } catch (err) {
                        showToast('Invalid QR code data', 'error');
                    }
                } else {
                    showToast('No QR code found in image', 'error');
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

// Load saved data
async function loadData() {
    // Always attempt to fetch from cloud first on new load
    if (githubToken && gistId) {
        const cloudSynced = await fetchFromCloud();
        if (cloudSynced) {
            // Data was loaded from cloud, update progress and return
            updateProgress();
            updateHeroTasks();
            return;
        }
    }
    
    // Load from localStorage if cloud sync failed or not configured
    const savedChapters = localStorage.getItem('hsc-study-tracker-v2');
    if (savedChapters) {
        chapters = JSON.parse(savedChapters);
    } else {
        const response = await fetch('config/syllabus.json');
        chapters = await response.json();
    }
    
    const routineResponse = await fetch('config/routine.json');
    routine = await routineResponse.json();
    
    const savedDailyTasks = localStorage.getItem('daily-tasks');
    dailyTasks = savedDailyTasks ? JSON.parse(savedDailyTasks) : {};
}

// Save data to localStorage
function saveData() {
    localStorage.setItem('hsc-study-tracker-v2', JSON.stringify(chapters));
    localStorage.setItem('daily-tasks', JSON.stringify(dailyTasks));
}

// Calculate time progress
function calculateTimeProgress() {
    const now = new Date();
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const daysPassed = Math.max(0, Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)));
    const percentage = Math.min(100, Math.max(0, (daysPassed / totalDays) * 100));
    
    return {
        percentage: Math.round(percentage),
        daysPassed: Math.min(daysPassed, totalDays),
        totalDays
    };
}

// Calculate syllabus progress
function calculateSyllabusProgress() {
    let totalChapters = 0;
    let completedChapters = 0;
    
    Object.values(chapters).forEach(subject => {
        Object.values(subject).forEach(paperChapters => {
            totalChapters += paperChapters.length;
            completedChapters += paperChapters.filter(ch => ch.done).length;
        });
    });
    
    const percentage = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;
    
    return {
        percentage,
        completedChapters,
        totalChapters
    };
}

// Get day schedule
function getDaySchedule(date = new Date()) {
    const dayOfWeek = date.getDay();
    const dateStr = date.toISOString().split('T')[0];
    
    const daysSinceStart = Math.floor((date - new Date('2025-09-15')) / (1000 * 60 * 60 * 24));
    const rotationIndex = daysSinceStart % 6;
    const rotationSubjects = ['Physics', 'Chemistry', 'Math', 'Biology', 'ICT', 'English'];
    const rotationSubject = rotationSubjects[rotationIndex];

    let scheduleKey;
    if (dayOfWeek === 5) {
        scheduleKey = 'friday';
    } else if ([0, 2, 4].includes(dayOfWeek)) {
        scheduleKey = 'sunTueThu';
    } else {
        scheduleKey = 'satMonWed';
    }

    const baseSchedule = {
        morning: routine[scheduleKey].morning.map(task => ({ ...task })),
        selfStudy: routine[scheduleKey].selfStudy.map(task => ({
            ...task,
            name: task.name.includes('${rotationSubject}') ? task.name.replace('${rotationSubject}', rotationSubject) : task.name
        })),
        dateStr,
        rotationSubject
    };

    return baseSchedule;
}

function parseTime(timeStr) {
    const [time, period] = timeStr.trim().split(' ');
    const [hours, minutes] = time.split(':').map(Number);
    let hour24 = hours;
    if (period === 'PM' && hours !== 12) hour24 += 12;
    if (period === 'AM' && hours === 12) hour24 = 0;
    return hour24 * 60 + (minutes || 0);
}

function getSortedTasks(date = new Date()) {
    const schedule = getDaySchedule(date);
    const allTasks = [...schedule.morning, ...schedule.selfStudy];
    allTasks.sort((a, b) => parseTime(a.time.split('-')[0]) - parseTime(b.time.split('-')[0]));
    return allTasks;
}

function getHeroTasks() {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const dateStr = now.toISOString().split('T')[0];
    const sortedTasks = getSortedTasks(now);
    let prev = null, current = null, next = null;

    for (let i = 0; i < sortedTasks.length; i++) {
        const task = sortedTasks[i];
        const [startStr, endStr] = task.time.split('-');
        const start = parseTime(startStr);
        const end = parseTime(endStr);

        if (currentTime >= start && currentTime < end) {
            current = { ...task, dateStr };
            if (i > 0) prev = { ...sortedTasks[i-1], dateStr };
            if (i < sortedTasks.length - 1) next = { ...sortedTasks[i+1], dateStr };
            return { prev, current, next };
        } else if (currentTime < start && !current) {
            current = { name: 'Free time', id: null, dateStr: null, time: '' };
            next = { ...sortedTasks[0], dateStr };
            return { prev, current, next };
        }
    }

    if (!current) {
        current = { name: 'Free time', id: null, dateStr: null, time: '' };
        prev = sortedTasks.length > 0 ? { ...sortedTasks[sortedTasks.length - 1], dateStr } : null;
    }

    return { prev, current, next };
}

function toggleDailyTask(dateStr, taskId) {
    if (!dateStr || !taskId) return;
    if (!dailyTasks[dateStr]) {
        dailyTasks[dateStr] = {};
    }
    dailyTasks[dateStr][taskId] = !dailyTasks[dateStr][taskId];
    saveDataAndSync();
    updateHeroTasks();
    updateScheduleModal();
}

function getTaskCompletion(dateStr, taskId) {
    return dailyTasks[dateStr]?.[taskId] || false;
}

function updateProgress() {
    const timeProgress = calculateTimeProgress();
    const syllabusProgress = calculateSyllabusProgress();

    document.getElementById('timePercentage').textContent = `${timeProgress.percentage}%`;
    document.getElementById('timeProgressBar').style.width = `${timeProgress.percentage}%`;
    document.getElementById('timeStats').textContent = `${timeProgress.daysPassed} / ${timeProgress.totalDays} days`;

    document.getElementById('syllabusPercentage').textContent = `${syllabusProgress.percentage}%`;
    document.getElementById('syllabusProgressBar').style.width = `${syllabusProgress.percentage}%`;
    document.getElementById('syllabusStats').textContent = `${syllabusProgress.completedChapters} / ${syllabusProgress.totalChapters} chapters`;
}

function updateHeroTasks() {
    const { prev, current, next } = getHeroTasks();
    let html = '';

    if (prev) {
        const isCompleted = getTaskCompletion(prev.dateStr, prev.id);
        html += `
            <div class="task-card small">
                <div class="task-label">Previous</div>
                <div class="task-name ${isCompleted ? 'completed' : ''}">${prev.name}</div>
                <div class="task-time">${prev.time}</div>
                <div class="task-tick ${isCompleted ? 'completed' : ''}" onclick="toggleDailyTask('${prev.dateStr}', '${prev.id}')">
                    ${isCompleted ? '<i class="ri-check-line animate-scale-in"></i>' : ''}
                </div>
            </div>
        `;
    } else {
        html += `<div class="task-card small"></div>`;
    }

    html += `
        <div class="task-card">
            <div class="task-label">Now</div>
            <div class="task-name">${current.name}</div>
            <div class="task-time">${current.time}</div>
    `;
    if (current.id && current.dateStr) {
        const isCompleted = getTaskCompletion(current.dateStr, current.id);
        html += `
            <div class="task-tick ${isCompleted ? 'completed' : ''}" onclick="toggleDailyTask('${current.dateStr}', '${current.id}')">
                ${isCompleted ? '<i class="ri-check-line animate-scale-in"></i>' : ''}
            </div>
        `;
    }
    html += `</div>`;

    if (next) {
        const isCompleted = getTaskCompletion(next.dateStr, next.id);
        html += `
            <div class="task-card small">
                <div class="task-label">Next</div>
                <div class="task-name ${isCompleted ? 'completed' : ''}">${next.name}</div>
                <div class="task-time">${next.time}</div>
                <div class="task-tick ${isCompleted ? 'completed' : ''}" onclick="toggleDailyTask('${next.dateStr}', '${next.id}')">
                    ${isCompleted ? '<i class="ri-check-line animate-scale-in"></i>' : ''}
                </div>
            </div>
        `;
    } else {
        html += `<div class="task-card small"></div>`;
    }

    document.getElementById('heroTasks').innerHTML = html;
}

function updateScheduleModal() {
    const schedule = getDaySchedule();
    
    const morningContainer = document.getElementById('modalMorningTasks');
    const morningScheduleDiv = document.getElementById('modalMorningSchedule');
    
    if (schedule.morning.length > 0) {
        morningScheduleDiv.style.display = 'block';
        morningContainer.innerHTML = schedule.morning.map(task => {
            const isCompleted = getTaskCompletion(schedule.dateStr, task.id);
            return `
                <div class="task-item">
                    <div class="task-checkbox ${isCompleted ? 'completed' : ''}" onclick="toggleDailyTask('${schedule.dateStr}', '${task.id}')">
                        ${isCompleted ? '<i class="ri-check-line animate-scale-in"></i>' : ''}
                    </div>
                    <div class="task-content">
                        <div class="task-name ${isCompleted ? 'completed' : ''}">${task.name}</div>
                        <div class="task-time">${task.time}</div>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        morningScheduleDiv.style.display = 'none';
    }

    const selfStudyContainer = document.getElementById('modalSelfStudyTasks');
    selfStudyContainer.innerHTML = schedule.selfStudy.map(task => {
        const isCompleted = getTaskCompletion(schedule.dateStr, task.id);
        return `
            <div class="task-item">
                <div class="task-checkbox ${isCompleted ? 'completed' : ''}" onclick="toggleDailyTask('${schedule.dateStr}', '${task.id}')">
                    ${isCompleted ? '<i class="ri-check-line animate-scale-in"></i>' : ''}
                </div>
                <div class="task-content">
                    <div class="task-name ${isCompleted ? 'completed' : ''}">${task.name}</div>
                    <div class="task-time">${task.time}</div>
                </div>
            </div>
        `;
    }).join('');
}

function updateHistoryModal() {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        return date;
    });

    const sampleSchedule = getDaySchedule(new Date());
    const allTasks = [...sampleSchedule.morning, ...sampleSchedule.selfStudy];

    const tableHead = document.getElementById('modalHistoryTableHead');
    tableHead.innerHTML = `
        <tr>
            <th>Date</th>
            ${allTasks.map(task => `<th>${task.name.split(' (')[0]}</th>`).join('')}
        </tr>
    `;

    const tableBody = document.getElementById('modalHistoryTableBody');
    tableBody.innerHTML = last7Days.map(date => {
        const dateStr = date.toISOString().split('T')[0];
        const schedule = getDaySchedule(date);
        const dayTasks = [...schedule.morning, ...schedule.selfStudy];
        
        return `
            <tr>
                <td style="font-weight: 500;">${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                ${allTasks.map(task => {
                    const dayTask = dayTasks.find(dt => dt.id === task.id);
                    const isCompleted = dayTask ? getTaskCompletion(dateStr, task.id) : false;
                    return `<td><i class="ri-${isCompleted ? 'check' : 'close'}-line history-icon ${isCompleted ? 'completed' : 'incomplete'}"></i></td>`;
                }).join('')}
            </tr>
        `;
    }).join('');
}

function openScheduleModal() {
    updateScheduleModal();
    document.getElementById('scheduleModal').classList.remove('hidden');
}

function closeScheduleModal() {
    document.getElementById('scheduleModal').classList.add('hidden');
}

function openHistoryModal() {
    updateHistoryModal();
    document.getElementById('historyModal').classList.remove('hidden');
}

function closeHistoryModal() {
    document.getElementById('historyModal').classList.add('hidden');
}

function openConfirmationModal(action, message, hasPin = false) {
    pendingConfirmationAction = action;
    hasPinConfirmation = hasPin;
    const messageContainer = document.getElementById('confirmationMessage');
    messageContainer.textContent = message;
    const pinConfirmation = document.getElementById('pinConfirmation');
    pinConfirmation.classList.toggle('hidden', !hasPin);
    if (hasPin) {
        document.getElementById('confirmPin').value = '';
        document.getElementById('pinConfirmError').classList.add('hidden');
    }
    document.getElementById('confirmationModal').classList.remove('hidden');
}

function closeConfirmationModal() {
    pendingConfirmationAction = null;
    hasPinConfirmation = false;
    document.getElementById('confirmationModal').classList.add('hidden');
}

async function executeConfirmationAction() {
    if (pendingConfirmationAction) {
        if (hasPinConfirmation) {
            const confirmPin = document.getElementById('confirmPin').value;
            const hashedConfirmPin = await hashPin(confirmPin);
            if (hashedConfirmPin !== localStorage.getItem('pinHash')) {
                document.getElementById('pinConfirmError').classList.remove('hidden');
                return;
            }
        }
        switch (pendingConfirmationAction) {
            case 'resetChapters':
                resetChapters();
                break;
        }
        closeConfirmationModal();
    }
}

function openSyllabusEditor() {
    renderSubjectTabs();
    renderChapters();
    updateSyncButton();
    document.getElementById('syllabusModal').classList.remove('hidden');
}

function closeSyllabusEditor() {
    document.getElementById('syllabusModal').classList.add('hidden');
}

function openSettingsModal() {
    document.getElementById('settingsModal').classList.remove('hidden');
    document.getElementById('autoSyncToggle').checked = autoSyncEnabled;
    document.getElementById('githubTokenInput').value = githubToken;
    document.getElementById('gistIdInput').value = gistId;
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}

function saveSettings() {
    autoSyncEnabled = document.getElementById('autoSyncToggle').checked;
    githubToken = document.getElementById('githubTokenInput').value.trim();
    gistId = document.getElementById('gistIdInput').value.trim();
    
    localStorage.setItem('autoSyncEnabled', autoSyncEnabled);
    localStorage.setItem('github-token', githubToken);
    localStorage.setItem('gist-id', gistId);
    
    updateSyncStatus();
    updateSyncButton();
    showToast('Settings saved', 'success');
    
    // Attempt to fetch from cloud after updating settings
    if (githubToken && gistId) {
        fetchFromCloud().then(() => {
            updateProgress();
            updateHeroTasks();
            renderChapters();
        });
    }
    
    closeSettingsModal();
}

function toggleHelp() {
    document.getElementById('helpSection').classList.toggle('hidden');
}

function renderSubjectTabs() {
    const tabsContainer = document.getElementById('subjectTabs');
    tabsContainer.innerHTML = Object.keys(chapters).map(subject => 
        `<button class="tab-button ${subject === activeTab ? 'active' : ''}" onclick="switchTab('${subject}')">${subject}</button>`
    ).join('');
}

function switchTab(subject) {
    activeTab = subject;
    renderSubjectTabs();
    renderChapters();
}

function renderChapters() {
    const chaptersGrid = document.getElementById('chaptersGrid');
    chaptersGrid.innerHTML = Object.entries(chapters[activeTab]).map(([paper, paperChapters]) => `
        <div class="paper-section">
            <h3 class="paper-title">${paper}</h3>
            <div class="chapter-list">
                ${paperChapters.map(chapter => `
                    <div class="chapter-item">
                        <div class="chapter-checkbox ${chapter.done ? 'completed' : ''}" onclick="toggleChapter('${activeTab}', '${paper}', '${chapter.id}')">
                            ${chapter.done ? '<i class="ri-check-line animate-scale-in"></i>' : ''}
                        </div>
                        <span class="chapter-title ${chapter.done ? 'completed' : ''}">${chapter.title}</span>
                        <div class="chapter-note-btn" onclick="toggleNote('${chapter.id}')">
                            <i class="ri-file-text-line"></i>
                        </div>
                    </div>
                    <div id="note-${chapter.id}" class="chapter-note ${expandedNotes[chapter.id] ? '' : 'hidden'}">
                        <textarea placeholder="Add a note..." oninput="updateNote('${activeTab}', '${paper}', '${chapter.id}', this.value)">${chapter.note || ''}</textarea>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function toggleChapter(subject, paper, chapterId) {
    chapters[subject][paper] = chapters[subject][paper].map(ch => 
        ch.id === chapterId ? { ...ch, done: !ch.done } : ch
    );
    saveDataAndSync();
    updateProgress();
    renderChapters();
}

function toggleNote(chapterId) {
    expandedNotes[chapterId] = !expandedNotes[chapterId];
    document.getElementById(`note-${chapterId}`).classList.toggle('hidden');
}

function updateNote(subject, paper, chapterId, note) {
    chapters[subject][paper] = chapters[subject][paper].map(ch => 
        ch.id === chapterId ? { ...ch, note } : ch
    );
    saveDataAndSync();
}

function updateSyncStatus() {
    const syncIcon = document.getElementById('syncIcon');
    const syncText = document.getElementById('syncText');
    
    if (syncStatus === 'syncing') {
        syncIcon.className = 'ri-cloud-line animate-pulse';
        syncText.textContent = 'Syncing...';
    } else if (syncStatus === 'success') {
        syncIcon.className = 'ri-cloud-line text-green-600';
        syncText.textContent = 'Synced';
    } else if (syncStatus === 'error') {
        syncIcon.className = 'ri-cloud-off-line text-red-600';
        syncText.textContent = 'Sync failed';
    } else {
        if (githubToken && gistId) {
            syncIcon.className = 'ri-cloud-line text-blue-600';
            syncText.textContent = lastSync ? `Last sync: ${lastSync}` : 'Ready to sync';
        } else {
            syncIcon.className = 'ri-cloud-line text-gray-400';
            syncText.textContent = 'Offline mode';
        }
    }
}

function updateSyncButton() {
    const syncButton = document.getElementById('syncButton');
    if (syncButton) {
        syncButton.style.display = githubToken && gistId ? 'block' : 'none';
    }
}

function showToast(message, type) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add(type);
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
        toast.classList.remove(type);
    }, 3000);
}

function exportData(format) {
    const flatChapters = [];
    Object.entries(chapters).forEach(([subject, papers]) => {
        Object.entries(papers).forEach(([paper, paperChapters]) => {
            paperChapters.forEach(ch => {
                flatChapters.push({
                    ...ch,
                    subject,
                    paper
                });
            });
        });
    });

    const timeProgress = calculateTimeProgress();
    const syllabusProgress = calculateSyllabusProgress();

    const data = {
        exported: new Date().toISOString(),
        timeProgress,
        syllabusProgress,
        chapters: flatChapters,
        dailyTasks
    };
    
    if (format === 'json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hsc-study-progress.json';
        a.click();
        URL.revokeObjectURL(url);
    } else if (format === 'csv') {
        const csvContent = [
            'Subject,Paper,Chapter,Completed,Note',
            ...flatChapters.map(ch => 
                `"${ch.subject}","${ch.paper}","${ch.title}",${ch.done ? 'Yes' : 'No'},"${ch.note || ''}"`
            )
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hsc-study-progress.csv';
        a.click();
        URL.revokeObjectURL(url);
    }
}

function resetChapters() {
    fetch('config/syllabus.json')
        .then(response => response.json())
        .then(data => {
            chapters = data;
            dailyTasks = {};
            expandedNotes = {};
            saveDataAndSync();
            updateProgress();
            updateHeroTasks();
            renderChapters();
            showToast('All progress reset', 'success');
        });
}

// QR Modal functions
function closeQRModal() {
    document.getElementById('qrExportModal').classList.add('hidden');
    document.getElementById('qrCodeContainer').innerHTML = '';
    qrCanvas = null;
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'r') {
            e.preventDefault();
            openConfirmationModal('resetChapters', 'Reset all progress? This cannot be undone.', false);
        } else if (e.key === 'e') {
            e.preventDefault();
            exportData('csv');
        } else if (e.key === 's') {
            e.preventDefault();
            syncToCloud();
        }
    }
    if (e.key === 'Escape') {
        if (!document.getElementById('lockscreenFull').classList.contains('hidden')) {
            return;
        }
        if (!document.getElementById('confirmationModal').classList.contains('hidden')) {
            closeConfirmationModal();
        } else if (!document.getElementById('syllabusModal').classList.contains('hidden')) {
            closeSyllabusEditor();
        } else if (!document.getElementById('scheduleModal').classList.contains('hidden')) {
            closeScheduleModal();
        } else if (!document.getElementById('historyModal').classList.contains('hidden')) {
            closeHistoryModal();
        } else if (!document.getElementById('qrExportModal').classList.contains('hidden')) {
            closeQRModal();
        } else if (!document.getElementById('settingsModal').classList.contains('hidden')) {
            closeSettingsModal();
        }
    }
    if (e.key === 'Enter' && !document.getElementById('lockscreenFull').classList.contains('hidden')) {
        submitPin();
    }
});

// Initialize app
async function init() {
    await loadData();
    updateProgress();
    updateHeroTasks();
    updateSyncStatus();

    // Update hero tasks every minute
    setInterval(updateHeroTasks, 60000);
}

// Start the app
checkLockscreen();