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
let pendingConfirmationAction = null;

// Get dates from localStorage with defaults
function getDateRange() {
    const startDate = new Date(localStorage.getItem('start-date') || '2025-09-15');
    const endDate = new Date(localStorage.getItem('end-date') || '2026-09-30');
    return { startDate, endDate };
}

// Update date range display
function updateDateRangeDisplay() {
    const { startDate, endDate } = getDateRange();
    const dateRangeElement = document.getElementById('dateRange');
    if (dateRangeElement) {
        dateRangeElement.textContent = `${startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} — ${endDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    }
}

// Check if tasks/schedule should be shown
function shouldShowTasks() {
    return localStorage.getItem('show-tasks') !== 'false';
}

// Update task visibility
function updateTaskVisibility() {
    const showTasks = shouldShowTasks();
    const heroTasksSection = document.getElementById('heroTasksSection');
    const scheduleBtn = document.getElementById('scheduleBtn');
    const historyBtn = document.getElementById('historyBtn');
    
    if (heroTasksSection) heroTasksSection.style.display = showTasks ? 'block' : 'none';
    if (scheduleBtn) scheduleBtn.style.display = showTasks ? 'flex' : 'none';
    if (historyBtn) historyBtn.style.display = showTasks ? 'flex' : 'none';
}

// Load saved data
async function loadData() {
    const savedChapters = localStorage.getItem('hsc-study-tracker-v2');
    if (savedChapters) {
        chapters = JSON.parse(savedChapters);
    } else {
        const syllabusFile = localStorage.getItem('selected-syllabus') || 'syllabus.json';
        const response = await fetch(`config/${syllabusFile}`);
        chapters = await response.json();
    }
    
    // Only load routine if tasks are enabled
    if (shouldShowTasks()) {
        const routineResponse = await fetch('config/routine.json');
        routine = await routineResponse.json();
        
        const savedDailyTasks = localStorage.getItem('daily-tasks');
        dailyTasks = savedDailyTasks ? JSON.parse(savedDailyTasks) : {};
    }
}

// Save data
function saveData() {
    localStorage.setItem('hsc-study-tracker-v2', JSON.stringify(chapters));
    if (shouldShowTasks()) {
        localStorage.setItem('daily-tasks', JSON.stringify(dailyTasks));
    }
}

// Calculate time progress
function calculateTimeProgress() {
    const { startDate, endDate } = getDateRange();
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
    if (!shouldShowTasks() || !routine) return { morning: [], selfStudy: [], dateStr: '', rotationSubject: '' };
    
    const dayOfWeek = date.getDay();
    const dateStr = date.toISOString().split('T')[0];
    
    const { startDate } = getDateRange();
    const daysSinceStart = Math.floor((date - startDate) / (1000 * 60 * 60 * 24));
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
        morning: routine[scheduleKey]?.morning?.map(task => ({ ...task })) || [],
        selfStudy: routine[scheduleKey]?.selfStudy?.map(task => ({
            ...task,
            name: task.name.includes('${rotationSubject}') ? task.name.replace('${rotationSubject}', rotationSubject) : task.name
        })) || [],
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
    if (!shouldShowTasks()) return [];
    
    const schedule = getDaySchedule(date);
    const allTasks = [...schedule.morning, ...schedule.selfStudy];
    allTasks.sort((a, b) => parseTime(a.time.split('-')[0]) - parseTime(b.time.split('-')[0]));
    return allTasks;
}

function getHeroTasks() {
    if (!shouldShowTasks()) return { prev: null, current: null, next: null };
    
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
    if (!dateStr || !taskId || !shouldShowTasks()) return;
    if (!dailyTasks[dateStr]) {
        dailyTasks[dateStr] = {};
    }
    dailyTasks[dateStr][taskId] = !dailyTasks[dateStr][taskId];
    saveData();
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
    if (!shouldShowTasks()) return;
    
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

    const heroTasksElement = document.getElementById('heroTasks');
    if (heroTasksElement) {
        heroTasksElement.innerHTML = html;
    }
}

function updateScheduleModal() {
    if (!shouldShowTasks()) return;
    
    const schedule = getDaySchedule();
    
    const morningContainer = document.getElementById('modalMorningTasks');
    const morningScheduleDiv = document.getElementById('modalMorningSchedule');
    
    if (morningContainer && schedule.morning.length > 0) {
        if (morningScheduleDiv) morningScheduleDiv.style.display = 'block';
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
    } else if (morningScheduleDiv) {
        morningScheduleDiv.style.display = 'none';
    }

    const selfStudyContainer = document.getElementById('modalSelfStudyTasks');
    if (selfStudyContainer) {
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
}

function updateHistoryModal() {
    if (!shouldShowTasks()) return;
    
    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        return date;
    });

    const sampleSchedule = getDaySchedule(new Date());
    const allTasks = [...sampleSchedule.morning, ...sampleSchedule.selfStudy];

    const tableHead = document.getElementById('modalHistoryTableHead');
    if (tableHead) {
        tableHead.innerHTML = `
            <tr>
                <th>Date</th>
                ${allTasks.map(task => `<th>${task.name.split(' (')[0]}</th>`).join('')}
            </tr>
        `;
    }

    const tableBody = document.getElementById('modalHistoryTableBody');
    if (tableBody) {
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
}

function openScheduleModal() {
    if (!shouldShowTasks()) return;
    updateScheduleModal();
    document.getElementById('scheduleModal').classList.remove('hidden');
}

function closeScheduleModal() {
    document.getElementById('scheduleModal').classList.add('hidden');
}

function openHistoryModal() {
    if (!shouldShowTasks()) return;
    updateHistoryModal();
    document.getElementById('historyModal').classList.remove('hidden');
}

function closeHistoryModal() {
    document.getElementById('historyModal').classList.add('hidden');
}

function openConfirmationModal(action, message) {
    pendingConfirmationAction = action;
    const messageContainer = document.getElementById('confirmationMessage');
    messageContainer.textContent = message;
    document.getElementById('confirmationModal').classList.remove('hidden');
}

function closeConfirmationModal() {
    pendingConfirmationAction = null;
    document.getElementById('confirmationModal').classList.add('hidden');
}

function executeConfirmationAction() {
    if (pendingConfirmationAction) {
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
    if (!githubToken || !gistId) {
        showToast('Missing token or Gist ID', 'error');
        return;
    }
    
    syncStatus = 'syncing';
    updateSyncStatus();
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
            throw new Error(`${response.status} ${response.statusText}`);
        }
    } catch (error) {
        syncStatus = 'error';
        showToast(`Sync failed: ${error.message}`, 'error');
        setTimeout(() => {
            syncStatus = 'idle';
            updateSyncStatus();
        }, 3000);
    }
    
    document.getElementById('syllabusLoading').classList.add('hidden');
    updateSyncStatus();
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
    const syllabusFile = localStorage.getItem('selected-syllabus') || 'syllabus.json';
    fetch(`config/${syllabusFile}`)
        .then(response => response.json())
        .then(data => {
            chapters = data;
            dailyTasks = {};
            expandedNotes = {};
            saveData();
            updateProgress();
            if (shouldShowTasks()) updateHeroTasks();
            renderChapters();
            showToast('All progress reset', 'success');
        });
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'r') {
            e.preventDefault();
            openConfirmationModal('resetChapters', 'Reset all progress? This cannot be undone.');
        } else if (e.key === 'e') {
            e.preventDefault();
            exportData('csv');
        } else if (e.key === 's') {
            e.preventDefault();
            syncToCloud();
        }
    }
    if (e.key === 'Escape') {
        if (!document.getElementById('confirmationModal').classList.contains('hidden')) {
            closeConfirmationModal();
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
    updateDateRangeDisplay();
    updateTaskVisibility();
    updateProgress();
    if (shouldShowTasks()) updateHeroTasks();
    updateSyncStatus();

    // Update hero tasks every minute if tasks are enabled
    if (shouldShowTasks()) {
        setInterval(updateHeroTasks, 60000);
    }
}

// Start the app
init();