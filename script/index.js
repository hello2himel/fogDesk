// Global state
let chapters = {};
let dailyTasks = {};
let currentTask = '';
let activeTab = 'Physics';
let expandedNotes = {};
let syncStatus = 'idle';
let githubToken = localStorage.getItem('github-token') || '';
let gistId = localStorage.getItem('gist-id') || '';
let lastSync = localStorage.getItem('last-sync') || '';

// Date constants
const startDate = new Date('2025-09-15');
const endDate = new Date('2026-09-30');

// Load saved data
async function loadData() {
    const savedChapters = localStorage.getItem('hsc-study-tracker-v2');
    if (savedChapters) {
        chapters = JSON.parse(savedChapters);
    } else {
        const response = await fetch('syllabus/syllabus.json');
        chapters = await response.json();
    }
    
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
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const dateStr = date.toISOString().split('T')[0];
    
    // Get rotation index for subjects (cycles every 6 days)
    const daysSinceStart = Math.floor((date - new Date('2025-09-15')) / (1000 * 60 * 60 * 24));
    const rotationIndex = daysSinceStart % 6;
    const rotationSubjects = ['Physics', 'Chemistry', 'Math', 'Biology', 'ICT', 'English'];
    const rotationSubject = rotationSubjects[rotationIndex];

    const baseSchedule = {
        morning: [],
        selfStudy: [],
        dateStr,
        rotationSubject
    };

    if (dayOfWeek === 5) { // Friday
        baseSchedule.selfStudy = [
            { id: 'chem-study', name: 'Chemistry Study', time: '6:30-7:30 PM' },
            { id: 'math-study', name: 'Math Study', time: '7:30-8:30 PM' },
            { id: 'revision-combined', name: 'Revision (Mixed)', time: '8:30-9:00 PM' },
            { id: 'bio-ict-study', name: 'Biology/ICT Study', time: '9:00-9:30 PM' },
            { id: 'dinner', name: 'Dinner', time: '9:30-10:00 PM' },
            { id: 'eng-study', name: 'English Study', time: '10:00-10:30 PM' },
            { id: 'revision-mixed', name: 'Revision (Mixed)', time: '10:30-11:00 PM' }
        ];
    } else if ([0, 2, 4].includes(dayOfWeek)) { // Sun, Tue, Thu
        baseSchedule.morning = [
            { id: 'chem-jahangir', name: 'Chemistry (Jahangir Sir)', time: '7:30-8:30 AM' },
            { id: 'college', name: 'College', time: '9:00-12:00 PM' },
            { id: 'online-chem', name: 'Online Chemistry', time: '2:00-3:30 PM' },
            { id: 'physics-ashraf', name: 'Physics (Ashraf Sir)', time: '4:00-6:00 PM' }
        ];
        baseSchedule.selfStudy = [
            { id: 'chem-study', name: 'Chemistry Study', time: '6:30-7:30 PM' },
            { id: 'math-study', name: 'Math Study', time: '7:30-8:30 PM' },
            { id: 'algorithm', name: `Algorithm (Physics/Chemistry)`, time: '8:30-9:00 PM' },
            { id: 'bio-ict-study', name: 'Biology/ICT Study', time: '9:00-9:30 PM' },
            { id: 'dinner', name: 'Dinner', time: '9:30-10:00 PM' },
            { id: 'eng-bangla-study', name: 'English/Bangla Study', time: '10:00-10:30 PM' },
            { id: 'questions', name: `Questions (${rotationSubject})`, time: '10:30-11:00 PM' }
        ];
    } else if ([6, 1, 3].includes(dayOfWeek)) { // Sat, Mon, Wed
        baseSchedule.morning = [
            { id: 'chem-jahangir', name: 'Chemistry (Jahangir Sir)', time: '7:30-8:30 AM' },
            { id: 'college', name: 'College', time: '9:00-12:00 PM' },
            { id: 'math-hanifa', name: 'Math (Hanifa Sir)', time: '2:20-3:30 PM' },
            { id: 'bio-santo', name: 'Biology (Santo Sir)', time: '4:00-5:00 PM' },
            { id: 'eng-ranju', name: 'English (Ranju Sir)', time: '5:00-6:00 PM' }
        ];
        baseSchedule.selfStudy = [
            { id: 'chem-study', name: 'Chemistry Study', time: '6:30-7:30 PM' },
            { id: 'math-study', name: 'Math Study', time: '7:30-8:30 PM' },
            { id: 'algorithm', name: `Algorithm (Physics/Math)`, time: '8:30-9:00 PM' },
            { id: 'bio-ict-study', name: 'Biology/ICT Study', time: '9:00-9:30 PM' },
            { id: 'dinner', name: 'Dinner', time: '9:30-10:00 PM' },
            { id: 'eng-bangla-study', name: 'English/Bangla Study', time: '10:00-10:30 PM' },
            { id: 'questions', name: `Questions (${rotationSubject})`, time: '10:30-11:00 PM' }
        ];
    }

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

// Get hero tasks (prev, current, next)
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

    // After last task
    if (!current) {
        current = { name: 'Free time', id: null, dateStr: null, time: '' };
        prev = sortedTasks.length > 0 ? { ...sortedTasks[sortedTasks.length - 1], dateStr } : null;
    }

    return { prev, current, next };
}

// Toggle daily task completion
function toggleDailyTask(dateStr, taskId) {
    if (!dateStr || !taskId) return;
    if (!dailyTasks[dateStr]) {
        dailyTasks[dateStr] = {};
    }
    dailyTasks[dateStr][taskId] = !dailyTasks[dateStr][taskId];
    saveData();
    updateHeroTasks();
    updateScheduleModal();
}

// Get task completion status
function getTaskCompletion(dateStr, taskId) {
    return dailyTasks[dateStr]?.[taskId] || false;
}

// Update progress displays
function updateProgress() {
    const timeProgress = calculateTimeProgress();
    const syllabusProgress = calculateSyllabusProgress();

    // Time progress
    document.getElementById('timePercentage').textContent = `${timeProgress.percentage}%`;
    document.getElementById('timeProgressBar').style.width = `${timeProgress.percentage}%`;
    document.getElementById('timeStats').textContent = `${timeProgress.daysPassed} / ${timeProgress.totalDays} days`;

    // Syllabus progress
    document.getElementById('syllabusPercentage').textContent = `${syllabusProgress.percentage}%`;
    document.getElementById('syllabusProgressBar').style.width = `${syllabusProgress.percentage}%`;
    document.getElementById('syllabusStats').textContent = `${syllabusProgress.completedChapters} / ${syllabusProgress.totalChapters} chapters`;
}

// Update hero tasks display
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

    // Current task
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

// Update schedule modal
function updateScheduleModal() {
    const schedule = getDaySchedule();
    
    // Morning tasks
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

    // Self study tasks
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

// Update history modal
function updateHistoryModal() {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        return date;
    });

    // Get all unique tasks from a sample day
    const sampleSchedule = getDaySchedule(new Date());
    const allTasks = [...sampleSchedule.morning, ...sampleSchedule.selfStudy];

    // Create table header
    const tableHead = document.getElementById('modalHistoryTableHead');
    tableHead.innerHTML = `
        <tr>
            <th>Date</th>
            ${allTasks.map(task => `<th>${task.name.split(' (')[0]}</th>`).join('')}
        </tr>
    `;

    // Create table body
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

// Modal open/close functions
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

function openSettings() {
    document.getElementById('githubToken').value = githubToken;
    document.getElementById('gistId').value = gistId;
    updateSyncButtons();
    document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettings() {
    githubToken = document.getElementById('githubToken').value;
    gistId = document.getElementById('gistId').value;
    if (githubToken) localStorage.setItem('github-token', githubToken);
    if (gistId) localStorage.setItem('gist-id', gistId);
    updateSyncStatus();
    document.getElementById('settingsModal').classList.add('hidden');
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

function toggleHelp() {
    document.getElementById('helpSection').classList.toggle('hidden');
}

// Syllabus editor functions
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
                        <textarea placeholder="Add a note..." oninput="updateNote('${activeTab}', '${paper}', '${chapter.id}', this.value)">${chapter.note}</textarea>
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
    saveData();
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
    saveData();
}

// Cloud sync functions
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

function updateSyncButtons() {
    const syncFromBtn = document.getElementById('syncFromCloudBtn');
    const syncToBtn = document.getElementById('syncToCloudBtn');
    
    if (gistId) {
        syncFromBtn.textContent = 'Sync From Cloud';
        syncToBtn.style.display = 'block';
    } else {
        syncFromBtn.textContent = 'Create New Gist';
        syncToBtn.style.display = 'none';
    }
}

function updateSyncButton() {
    const syncButton = document.getElementById('syncButton');
    if (githubToken && gistId) {
        syncButton.style.display = 'block';
    } else {
        syncButton.style.display = 'none';
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

async function syncToCloud() {
    if (!githubToken || !gistId) return;
    
    syncStatus = 'syncing';
    updateSyncStatus();
    document.getElementById('settingsLoading').classList.remove('hidden');
    document.getElementById('syllabusLoading').classList.remove('hidden');
    
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
            setTimeout(() => {
                syncStatus = 'idle';
                updateSyncStatus();
            }, 2000);
        } else {
            throw new Error('Sync failed');
        }
    } catch (error) {
        syncStatus = 'error';
        showToast('Sync failed', 'error');
        setTimeout(() => {
            syncStatus = 'idle';
            updateSyncStatus();
        }, 3000);
    }
    
    document.getElementById('settingsLoading').classList.add('hidden');
    document.getElementById('syllabusLoading').classList.add('hidden');
    updateSyncStatus();
}

async function syncFromCloud() {
    if (!githubToken) return;
    
    syncStatus = 'syncing';
    updateSyncStatus();
    document.getElementById('settingsLoading').classList.remove('hidden');
    document.getElementById('syllabusLoading').classList.remove('hidden');
    
    try {
        if (gistId) {
            // Sync from existing gist
            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                headers: {
                    'Authorization': `Bearer ${githubToken}`,
                }
            });

            if (response.ok) {
                const gist = await response.json();
                const fileContent = gist.files['hsc-study-tracker.json']?.content;
                
                if (fileContent) {
                    const data = JSON.parse(fileContent);
                    chapters = data.chapters;
                    if (data.dailyTasks) dailyTasks = data.dailyTasks;
                    saveData();
                    updateProgress();
                    updateHeroTasks();
                    updateScheduleModal();
                    syncStatus = 'success';
                    showToast('Sync successful', 'success');
                    const syncTime = new Date().toLocaleString();
                    lastSync = syncTime;
                    localStorage.setItem('last-sync', syncTime);
                }
            } else {
                throw new Error('Download failed');
            }
        } else {
            // Create new gist
            const data = {
                chapters,
                dailyTasks,
                lastUpdated: new Date().toISOString(),
                device: 'initial'
            };

            const response = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${githubToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    description: 'HSC Study Tracker Progress',
                    public: false,
                    files: {
                        'hsc-study-tracker.json': {
                            content: JSON.stringify(data, null, 2)
                        }
                    }
                })
            });

            if (response.ok) {
                const gist = await response.json();
                gistId = gist.id;
                localStorage.setItem('gist-id', gistId);
                document.getElementById('gistId').value = gistId;
                updateSyncButtons();
                syncStatus = 'success';
                showToast('Gist created and synced', 'success');
            } else {
                throw new Error('Failed to create gist');
            }
        }
        
        setTimeout(() => {
            syncStatus = 'idle';
            updateSyncStatus();
        }, 2000);
    } catch (error) {
        syncStatus = 'error';
        showToast('Sync failed', 'error');
        setTimeout(() => {
            syncStatus = 'idle';
            updateSyncStatus();
        }, 3000);
    }
    
    document.getElementById('settingsLoading').classList.add('hidden');
    document.getElementById('syllabusLoading').classList.add('hidden');
    updateSyncStatus();
}

// Export functions
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
                `"${ch.subject}","${ch.paper}","${ch.title}",${ch.done ? 'Yes' : 'No'},"${ch.note}"`
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

// Reset function
function resetChapters() {
    if (confirm('Reset all progress? This cannot be undone.')) {
        chapters = JSON.parse(JSON.stringify(initialChapters));
        dailyTasks = {};
        expandedNotes = {};
        saveData();
        updateProgress();
        updateHeroTasks();
        renderChapters();
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'r') {
            e.preventDefault();
            resetChapters();
        } else if (e.key === 'e') {
            e.preventDefault();
            exportData('csv');
        } else if (e.key === 's') {
            e.preventDefault();
            syncToCloud();
        }
    }
    if (e.key === 'Escape') {
        if (!document.getElementById('settingsModal').classList.contains('hidden')) {
            closeSettings();
        } else if (!document.getElementById('syllabusModal').classList.contains('hidden')) {
            closeSyllabusEditor();
        } else if (!document.getElementById('scheduleModal').classList.contains('hidden')) {
            closeScheduleModal();
        } else if (!document.getElementById('historyModal').classList.contains('hidden')) {
            closeHistoryModal();
        }
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
init();