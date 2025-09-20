// Global state
let githubToken = localStorage.getItem('github-token') || '';
let gistId = localStorage.getItem('gist-id') || '';
let lastSync = localStorage.getItem('last-sync') || '';
let syncStatus = 'idle';
let pendingConfirmationAction = null;
let qrCanvas = null;
let videoStream = null;

// Initialize settings page
function initSettings() {
    document.getElementById('githubToken').value = githubToken;
    document.getElementById('gistId').value = gistId;
    
    // Initialize study configuration
    const startDate = localStorage.getItem('start-date') || '2025-09-15';
    const endDate = localStorage.getItem('end-date') || '2026-09-30';
    const selectedSyllabus = localStorage.getItem('selected-syllabus') || 'syllabus.json';
    const showTasks = localStorage.getItem('show-tasks') !== 'false';
    
    document.getElementById('startDate').value = startDate;
    document.getElementById('endDate').value = endDate;
    document.getElementById('syllabusSelect').value = selectedSyllabus;
    document.getElementById('showTasksToggle').checked = showTasks;
    
    updateSyncButtons();
}

// Save study configuration
function saveStudyConfig() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const selectedSyllabus = document.getElementById('syllabusSelect').value;
    const showTasks = document.getElementById('showTasksToggle').checked;
    
    // Validate dates
    if (!startDate || !endDate) {
        showToast('Please set both start and end dates');
        return;
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start >= end) {
        showToast('Start date must be before end date');
        return;
    }
    
    // Save to localStorage
    localStorage.setItem('start-date', startDate);
    localStorage.setItem('end-date', endDate);
    localStorage.setItem('selected-syllabus', selectedSyllabus);
    localStorage.setItem('show-tasks', showTasks.toString());
    
    showToast('Study configuration saved successfully');
}

// Update sync buttons based on Gist ID
function updateSyncButtons() {
    const syncFromBtn = document.getElementById('syncFromCloudBtn');
    const syncToBtn = document.getElementById('syncToCloudBtn');
    
    if (gistId) {
        syncFromBtn.innerHTML = '<i class="ri-download-cloud-2-line"></i> Sync From Cloud';
        syncToBtn.style.display = 'block';
    } else {
        syncFromBtn.innerHTML = '<i class="ri-download-cloud-2-line"></i> Create New Gist';
        syncToBtn.style.display = 'none';
    }
}

// Show toast notification
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Open confirmation modal
function openConfirmationModal(action, message) {
    pendingConfirmationAction = action;
    const messageContainer = document.getElementById('confirmationMessage');
    messageContainer.textContent = message;
    document.getElementById('confirmationModal').classList.remove('hidden');
}

// Close confirmation modal
function closeConfirmationModal() {
    pendingConfirmationAction = null;
    document.getElementById('confirmationModal').classList.add('hidden');
}

// Execute confirmation action
function executeConfirmationAction() {
    if (pendingConfirmationAction) {
        switch (pendingConfirmationAction) {
            case 'clearGistData':
                clearGistData();
                break;
            case 'clearSyllabusCompletion':
                clearSyllabusCompletion();
                break;
            case 'clearLocalDatabase':
                clearLocalDatabase();
                break;
        }
        closeConfirmationModal();
    }
}

// Open QR import modal
function openImportModal() {
    document.getElementById('qrImportModal').classList.remove('hidden');
}

// Close QR import modal
function closeImportModal() {
    stopQRScan();
    document.getElementById('qrImportModal').classList.add('hidden');
}

// Export backup QR code and show in modal
function exportGistQR() {
    if (typeof QRCode === 'undefined') {
        console.error('QRCode library not loaded');
        showToast('QR code library not loaded');
        return;
    }

    const currentGithubToken = document.getElementById('githubToken').value.trim();
    const currentGistId = document.getElementById('gistId').value.trim();
    const startDate = localStorage.getItem('start-date') || '2025-09-15';
    const endDate = localStorage.getItem('end-date') || '2026-09-30';
    const selectedSyllabus = localStorage.getItem('selected-syllabus') || 'syllabus.json';
    const showTasks = localStorage.getItem('show-tasks') !== 'false';

    const backupData = {
        githubToken: currentGithubToken,
        gistId: currentGistId,
        startDate: startDate,
        endDate: endDate,
        selectedSyllabus: selectedSyllabus,
        showTasks: showTasks,
        exportDate: new Date().toISOString()
    };

    if (!currentGithubToken && !currentGistId) {
        showToast('No sync data to export. Set up GitHub token and Gist ID first.');
        return;
    }

    const dataString = JSON.stringify(backupData);
    console.log('Generating backup QR code');

    const qrContainer = document.getElementById('qrCodeContainer');
    qrContainer.innerHTML = '';
    
    try {
        new QRCode(qrContainer, {
            text: dataString,
            width: 256,
            height: 256,
            colorDark: '#000000',
            colorLight: '#FFFFFF',
            correctLevel: QRCode.CorrectLevel.H
        });
        
        qrCanvas = qrContainer.querySelector('canvas');
        if (!qrCanvas) {
            console.error('No canvas generated by QRCode');
            showToast('Failed to generate QR code: No canvas created');
            return;
        }
        
        console.log('Backup QR code generated successfully');
        document.getElementById('qrExportModal').classList.remove('hidden');
        showToast('Backup QR code generated');
    } catch (err) {
        console.error('Error in QR code generation:', err);
        showToast(`Error generating QR code: ${err.message}`);
    }
}

// Download QR code
function downloadQRCode() {
    if (qrCanvas) {
        const link = document.createElement('a');
        link.download = 'syllabus-pulse-backup.png';
        link.href = qrCanvas.toDataURL('image/png');
        link.click();
        showToast('Backup QR code downloaded');
    } else {
        showToast('No QR code to download');
    }
}

// Close QR export modal
function closeQRModal() {
    document.getElementById('qrExportModal').classList.add('hidden');
    document.getElementById('qrCodeContainer').innerHTML = '';
    qrCanvas = null;
}

// Start QR code scanning with webcam
async function startQRScan() {
    const video = document.getElementById('qrVideo');
    const canvas = document.getElementById('qrCanvas');
    const qrScanContainer = document.getElementById('qrScanContainer');
    
    try {
        // Try different camera constraints for better compatibility
        let constraints = { video: { facingMode: 'environment' } };
        
        try {
            videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (envError) {
            // Fallback to any available camera
            constraints = { video: true };
            videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        }
        
        video.srcObject = videoStream;
        qrScanContainer.classList.remove('hidden');
        
        // Wait for video to be ready
        video.onloadedmetadata = () => {
            video.play();
        };
        
        const ctx = canvas.getContext('2d');
        let isScanning = true;
        
        const scanQR = () => {
            if (!isScanning || qrScanContainer.classList.contains('hidden')) {
                return;
            }
            
            if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                try {
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, canvas.width, canvas.height);
                    if (code && code.data) {
                        isScanning = false;
                        processQRData(code.data);
                        return;
                    }
                } catch (scanError) {
                    console.warn('QR scanning error:', scanError);
                }
            }
            
            requestAnimationFrame(scanQR);
        };
        
        // Start scanning after a short delay to ensure video is ready
        setTimeout(() => {
            if (isScanning) {
                scanQR();
            }
        }, 500);
        
    } catch (err) {
        console.error('Camera access error:', err);
        if (err.name === 'NotAllowedError') {
            showToast('Camera access denied. Please allow camera access and try again.');
        } else if (err.name === 'NotFoundError') {
            showToast('No camera found. Please use the gallery option instead.');
        } else if (err.name === 'NotSupportedError') {
            showToast('Camera not supported in this browser. Please use the gallery option.');
        } else {
            showToast('Failed to access camera. Please try the gallery option.');
        }
        qrScanContainer.classList.add('hidden');
    }
}

// Stop QR code scanning
function stopQRScan() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    document.getElementById('qrVideo').srcObject = null;
    document.getElementById('qrScanContainer').classList.add('hidden');
}

// Import backup QR from gallery
function importGistQR(event) {
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
                    processQRData(code.data);
                } else {
                    showToast('No QR code found in image');
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    event.target.value = '';
}

// Process QR data (common function for both scan and import)
function processQRData(qrDataString) {
    try {
        const data = JSON.parse(qrDataString);
        
        const imported = [];
        
        // Import GitHub token and Gist ID
        if (data.githubToken) {
            githubToken = data.githubToken;
            localStorage.setItem('github-token', data.githubToken);
            document.getElementById('githubToken').value = data.githubToken;
            imported.push('GitHub token');
        }
        
        if (data.gistId) {
            gistId = data.gistId;
            localStorage.setItem('gist-id', data.gistId);
            document.getElementById('gistId').value = data.gistId;
            imported.push('Gist ID');
        }
        
        // Import study configuration
        if (data.startDate) {
            localStorage.setItem('start-date', data.startDate);
            document.getElementById('startDate').value = data.startDate;
            imported.push('start date');
        }
        
        if (data.endDate) {
            localStorage.setItem('end-date', data.endDate);
            document.getElementById('endDate').value = data.endDate;
            imported.push('end date');
        }
        
        if (data.selectedSyllabus) {
            localStorage.setItem('selected-syllabus', data.selectedSyllabus);
            document.getElementById('syllabusSelect').value = data.selectedSyllabus;
            imported.push('syllabus selection');
        }
        
        if (data.hasOwnProperty('showTasks')) {
            localStorage.setItem('show-tasks', data.showTasks.toString());
            document.getElementById('showTasksToggle').checked = data.showTasks;
            imported.push('task settings');
        }
        
        updateSyncButtons();
        
        if (imported.length > 0) {
            showToast(`Successfully imported: ${imported.join(', ')}`);
            stopQRScan();
            closeImportModal();
        } else {
            showToast('QR code contains no valid backup data');
        }
        
    } catch (err) {
        console.error('Error parsing QR data:', err);
        showToast('Invalid backup QR code format');
    }
}

// Clear Gist data
function clearGistData() {
    gistId = '';
    lastSync = '';
    localStorage.removeItem('gist-id');
    localStorage.removeItem('last-sync');
    document.getElementById('gistId').value = '';
    updateSyncButtons();
    showToast('Cloud sync data cleared');
}

// Clear syllabus completion
function clearSyllabusCompletion() {
    const chapters = JSON.parse(localStorage.getItem('hsc-study-tracker-v2') || '{}');
    Object.keys(chapters).forEach(subject => {
        Object.keys(chapters[subject]).forEach(paper => {
            chapters[subject][paper] = chapters[subject][paper].map(ch => ({
                ...ch,
                done: false,
                note: ''
            }));
        });
    });
    localStorage.setItem('hsc-study-tracker-v2', JSON.stringify(chapters));
    showToast('All progress cleared');
}

// Clear local database
function clearLocalDatabase() {
    localStorage.clear();
    githubToken = '';
    gistId = '';
    lastSync = '';
    document.getElementById('githubToken').value = '';
    document.getElementById('gistId').value = '';
    document.getElementById('startDate').value = '2025-09-15';
    document.getElementById('endDate').value = '2026-09-30';
    document.getElementById('syllabusSelect').value = 'syllabus.json';
    document.getElementById('showTasksToggle').checked = true;
    updateSyncButtons();
    showToast('All local data cleared');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1500);
}

// Sync to cloud
async function syncToCloud() {
    githubToken = document.getElementById('githubToken').value.trim();
    gistId = document.getElementById('gistId').value.trim();

    if (!githubToken || !gistId) {
        showToast('Missing GitHub token or Gist ID');
        return;
    }
    
    syncStatus = 'syncing';
    document.getElementById('settingsLoading').classList.remove('hidden');
    
    try {
        const chapters = JSON.parse(localStorage.getItem('hsc-study-tracker-v2') || '{}');
        const dailyTasks = JSON.parse(localStorage.getItem('daily-tasks') || '{}');
        const data = {
            chapters,
            dailyTasks,
            settings: {
                startDate: localStorage.getItem('start-date'),
                endDate: localStorage.getItem('end-date'),
                selectedSyllabus: localStorage.getItem('selected-syllabus'),
                showTasks: localStorage.getItem('show-tasks')
            },
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
            showToast('Sync to cloud successful');
            const syncTime = new Date().toLocaleString();
            lastSync = syncTime;
            localStorage.setItem('last-sync', syncTime);
            localStorage.setItem('github-token', githubToken);
            localStorage.setItem('gist-id', gistId);
            setTimeout(() => {
                syncStatus = 'idle';
            }, 2000);
        } else {
            const errorText = await response.text();
            throw new Error(`${response.status} ${response.statusText}: ${errorText}`);
        }
    } catch (error) {
        syncStatus = 'error';
        showToast(`Sync failed: ${error.message}`);
        console.error('Sync error:', error);
        setTimeout(() => {
            syncStatus = 'idle';
        }, 3000);
    }
    
    document.getElementById('settingsLoading').classList.add('hidden');
}

// Sync from cloud
async function syncFromCloud() {
    githubToken = document.getElementById('githubToken').value.trim();
    gistId = document.getElementById('gistId').value.trim();

    if (!githubToken) {
        showToast('Missing GitHub token');
        return;
    }
    
    syncStatus = 'syncing';
    document.getElementById('settingsLoading').classList.remove('hidden');
    
    try {
        if (gistId) {
            // Sync from existing Gist
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
                    localStorage.setItem('hsc-study-tracker-v2', JSON.stringify(data.chapters));
                    if (data.dailyTasks) {
                        localStorage.setItem('daily-tasks', JSON.stringify(data.dailyTasks));
                    }
                    
                    // Import settings if available
                    if (data.settings) {
                        if (data.settings.startDate) {
                            localStorage.setItem('start-date', data.settings.startDate);
                            document.getElementById('startDate').value = data.settings.startDate;
                        }
                        if (data.settings.endDate) {
                            localStorage.setItem('end-date', data.settings.endDate);
                            document.getElementById('endDate').value = data.settings.endDate;
                        }
                        if (data.settings.selectedSyllabus) {
                            localStorage.setItem('selected-syllabus', data.settings.selectedSyllabus);
                            document.getElementById('syllabusSelect').value = data.settings.selectedSyllabus;
                        }
                        if (data.settings.showTasks !== undefined) {
                            localStorage.setItem('show-tasks', data.settings.showTasks);
                            document.getElementById('showTasksToggle').checked = data.settings.showTasks === 'true';
                        }
                    }
                    
                    syncStatus = 'success';
                    showToast('Sync from cloud successful');
                    const syncTime = new Date().toLocaleString();
                    lastSync = syncTime;
                    localStorage.setItem('last-sync', syncTime);
                    localStorage.setItem('github-token', githubToken);
                    localStorage.setItem('gist-id', gistId);
                } else {
                    throw new Error('No valid data found in Gist');
                }
            } else {
                const errorText = await response.text();
                throw new Error(`${response.status} ${response.statusText}: ${errorText}`);
            }
        } else {
            // Create new Gist
            const chapters = JSON.parse(localStorage.getItem('hsc-study-tracker-v2') || '{}');
            const dailyTasks = JSON.parse(localStorage.getItem('daily-tasks') || '{}');
            const data = {
                chapters,
                dailyTasks,
                settings: {
                    startDate: localStorage.getItem('start-date'),
                    endDate: localStorage.getItem('end-date'),
                    selectedSyllabus: localStorage.getItem('selected-syllabus'),
                    showTasks: localStorage.getItem('show-tasks')
                },
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
                    description: 'HSC Study Tracker Progress - Syllabus Pulse',
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
                showToast('New Gist created and synced successfully');
                localStorage.setItem('github-token', githubToken);
                
                const syncTime = new Date().toLocaleString();
                lastSync = syncTime;
                localStorage.setItem('last-sync', syncTime);
            } else {
                const errorText = await response.text();
                throw new Error(`${response.status} ${response.statusText}: ${errorText}`);
            }
        }
        
        setTimeout(() => {
            syncStatus = 'idle';
        }, 2000);
    } catch (error) {
        syncStatus = 'error';
        showToast(`Sync failed: ${error.message}`);
        console.error('Sync error:', error);
        setTimeout(() => {
            syncStatus = 'idle';
        }, 3000);
    }
    
    document.getElementById('settingsLoading').classList.add('hidden');
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!document.getElementById('confirmationModal').classList.contains('hidden')) {
            closeConfirmationModal();
        } else if (!document.getElementById('qrExportModal').classList.contains('hidden')) {
            closeQRModal();
        } else if (!document.getElementById('qrImportModal').classList.contains('hidden')) {
            closeImportModal();
        }
    }
});

// Initialize settings page
initSettings();