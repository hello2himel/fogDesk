// Global state
let githubToken = localStorage.getItem('github-token') || '';
let gistId = localStorage.getItem('gist-id') || '';
let lastSync = localStorage.getItem('last-sync') || '';
let pin = localStorage.getItem('app-pin') || '';
let syncStatus = 'idle';
let pendingConfirmationAction = null;
let hasPinConfirmation = false;
let qrCanvas = null;
let videoStream = null;

// Initialize settings page
function initSettings() {
    document.getElementById('githubToken').value = githubToken;
    document.getElementById('gistId').value = gistId;
    document.getElementById('newPin').value = '';
    updateSyncButtons();
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

// Close confirmation modal
function closeConfirmationModal() {
    pendingConfirmationAction = null;
    hasPinConfirmation = false;
    document.getElementById('confirmationModal').classList.add('hidden');
}

// Execute confirmation action
function executeConfirmationAction() {
    if (pendingConfirmationAction) {
        if (hasPinConfirmation) {
            const confirmPin = document.getElementById('confirmPin').value;
            if (confirmPin !== pin) {
                document.getElementById('pinConfirmError').classList.remove('hidden');
                return;
            }
        }
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

// Change PIN
function changePin() {
    const newPin = document.getElementById('newPin').value;
    if (newPin.length === 4 && /^\d+$/.test(newPin)) {
        pin = newPin;
        localStorage.setItem('app-pin', newPin);
        showToast('PIN updated successfully');
        document.getElementById('newPin').value = '';
    } else {
        showToast('PIN must be a 4-digit number');
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

// Export Gist QR code and show in modal
function exportGistQR() {
    const data = JSON.stringify({ gistId, pin });
    const qrContainer = document.getElementById('qrCodeContainer');
    qrContainer.innerHTML = ''; // Clear previous QR code
    qrCanvas = document.createElement('canvas');
    qrContainer.appendChild(qrCanvas);
    
    QRCode.toCanvas(qrCanvas, data, {
        width: 256,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    }, function (error) {
        if (error) {
            showToast('Failed to generate QR code');
            return;
        }
        document.getElementById('qrExportModal').classList.remove('hidden');
    });
}

// Download QR code
function downloadQRCode() {
    if (qrCanvas) {
        const link = document.createElement('a');
        link.download = 'gist-qr.png';
        link.href = qrCanvas.toDataURL('image/png');
        link.click();
        showToast('QR code downloaded');
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
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = videoStream;
        qrScanContainer.classList.remove('hidden');
        
        const ctx = canvas.getContext('2d');
        const scanQR = () => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, canvas.width, canvas.height);
                if (code) {
                    try {
                        const data = JSON.parse(code.data);
                        gistId = data.gistId || '';
                        pin = data.pin || '';
                        localStorage.setItem('gist-id', gistId);
                        localStorage.setItem('app-pin', pin);
                        document.getElementById('gistId').value = gistId;
                        updateSyncButtons();
                        showToast('Gist and PIN imported');
                        stopQRScan();
                        closeImportModal();
                    } catch (err) {
                        showToast('Invalid QR code data');
                    }
                }
            }
            if (!qrScanContainer.classList.contains('hidden')) {
                requestAnimationFrame(scanQR);
            }
        };
        requestAnimationFrame(scanQR);
    } catch (err) {
        showToast('Failed to access camera');
        console.error(err);
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

// Import Gist QR from gallery
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
                    try {
                        const data = JSON.parse(code.data);
                        gistId = data.gistId || '';
                        pin = data.pin || '';
                        localStorage.setItem('gist-id', gistId);
                        localStorage.setItem('app-pin', pin);
                        document.getElementById('gistId').value = gistId;
                        updateSyncButtons();
                        showToast('Gist and PIN imported');
                        closeImportModal();
                    } catch (err) {
                        showToast('Invalid QR code data');
                    }
                } else {
                    showToast('No QR code found');
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
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
    showToast('Gist data cleared');
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
    showToast('Syllabus cleared');
}

// Clear local database
function clearLocalDatabase() {
    localStorage.clear();
    githubToken = '';
    gistId = '';
    lastSync = '';
    pin = '';
    document.getElementById('githubToken').value = '';
    document.getElementById('gistId').value = '';
    document.getElementById('newPin').value = '';
    showToast('Database cleared');
    window.location.href = 'index.html';
}

// Sync to cloud
async function syncToCloud() {
    githubToken = document.getElementById('githubToken').value;
    gistId = document.getElementById('gistId').value;

    if (!githubToken || !gistId) {
        showToast('Missing token or Gist ID');
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
            showToast('Sync successful');
            const syncTime = new Date().toLocaleString();
            lastSync = syncTime;
            localStorage.setItem('last-sync', syncTime);
            localStorage.setItem('github-token', githubToken);
            localStorage.setItem('gist-id', gistId);
            setTimeout(() => {
                syncStatus = 'idle';
            }, 2000);
        } else {
            throw new Error(`${response.status} ${response.statusText}`);
        }
    } catch (error) {
        syncStatus = 'error';
        showToast(`Sync failed: ${error.message}`);
        setTimeout(() => {
            syncStatus = 'idle';
        }, 3000);
    }
    
    document.getElementById('settingsLoading').classList.add('hidden');
}

// Sync from cloud
async function syncFromCloud() {
    githubToken = document.getElementById('githubToken').value;
    gistId = document.getElementById('gistId').value;

    if (!githubToken) {
        showToast('Missing GitHub token');
        return;
    }
    
    syncStatus = 'syncing';
    document.getElementById('settingsLoading').classList.remove('hidden');
    
    try {
        if (gistId) {
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
                    syncStatus = 'success';
                    showToast('Sync successful');
                    const syncTime = new Date().toLocaleString();
                    lastSync = syncTime;
                    localStorage.setItem('last-sync', syncTime);
                    localStorage.setItem('github-token', githubToken);
                    localStorage.setItem('gist-id', gistId);
                } else {
                    throw new Error('No valid data in Gist');
                }
            } else {
                throw new Error(`${response.status} ${response.statusText}`);
            }
        } else {
            const chapters = JSON.parse(localStorage.getItem('hsc-study-tracker-v2') || '{}');
            const dailyTasks = JSON.parse(localStorage.getItem('daily-tasks') || '{}');
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
                showToast('Gist created and synced');
                localStorage.setItem('github-token', githubToken);
            } else {
                throw new Error(`${response.status} ${response.statusText}`);
            }
        }
        
        setTimeout(() => {
            syncStatus = 'idle';
        }, 2000);
    } catch (error) {
        syncStatus = 'error';
        showToast(`Sync failed: ${error.message}`);
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