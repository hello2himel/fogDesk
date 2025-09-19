let currentStep = 1;
let pinInput = '';
let githubToken = '';
let gistId = '';

// Sidebar content for each step
const stepInfo = {
    1: { title: 'Welcome', description: 'Let\'s get you set up with Syllabus Pulse to track your study progress effectively.' },
    2: { title: 'Data Storage', description: 'Configure how your data is stored and optionally enable cross-device synchronization.' },
    3: { title: 'Security', description: 'Protect your data with a secure 4-digit PIN that only you know.' }
};

// Initialize setup
function initSetup() {
    if (localStorage.getItem('setupCompleted') === 'true') {
        window.location.href = '/index.html';
        return;
    }
    showStep(1);
}

// Show specific step
function showStep(step) {
    document.querySelectorAll('.wizard-panel').forEach(panel => {
        panel.classList.add('hidden');
    });
    document.getElementById(`wizardStep${step}`).classList.remove('hidden');
    updateProgress(step);
    updateSidebar(step);
    currentStep = step;
    if (step === 3) {
        pinInput = '';
        updatePinDisplay();
    }
}

// Update progress indicators
function updateProgress(step) {
    document.querySelectorAll('.progress-step').forEach((indicator, index) => {
        const stepNum = index + 1;
        indicator.classList.remove('active', 'completed');
        if (stepNum < step) {
            indicator.classList.add('completed');
        } else if (stepNum === step) {
            indicator.classList.add('active');
        }
    });
}

// Update sidebar content
function updateSidebar(step) {
    const info = stepInfo[step];
    document.getElementById('sidebarTitle').textContent = info.title;
    document.getElementById('sidebarDescription').textContent = info.description;
}

// Navigation functions
function nextStep(step) {
    showStep(step);
}

function prevStep(step) {
    showStep(step);
}

// PIN entry functions
function enterPinDigit(digit) {
    if (pinInput.length < 4) {
        pinInput += digit;
        updatePinDisplay();
    }
}

function clearPin() {
    pinInput = '';
    updatePinDisplay();
}

function updatePinDisplay() {
    for (let i = 1; i <= 4; i++) {
        const digit = document.getElementById(`pinDigit${i}`);
        if (i <= pinInput.length) {
            digit.classList.add('filled');
        } else {
            digit.classList.remove('filled');
        }
    }
}

// Hash PIN for secure storage
async function hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Complete setup
async function completeSetup() {
    if (pinInput.length !== 4 || !/^\d{4}$/.test(pinInput)) {
        showToast('PIN must be exactly 4 digits', 'error');
        return;
    }
    try {
        const hashedPin = await hashPin(pinInput);
        localStorage.setItem('pinHash', hashedPin);
        localStorage.setItem('setupCompleted', 'true');
        showToast('Setup completed successfully!', 'success');
        setTimeout(() => {
            window.location.href = '/index.html';
        }, 1500);
    } catch (error) {
        showToast('Failed to complete setup: ' + error.message, 'error');
        console.error('Setup error:', error);
    }
}

// Sync modal functions
function openSyncModal() {
    const modal = document.getElementById('syncModal');
    modal.classList.add('show');
}

function closeSyncModal() {
    const modal = document.getElementById('syncModal');
    modal.classList.remove('show');
    document.getElementById('githubToken').value = '';
    document.getElementById('gistId').value = '';
}

// Save sync settings
function saveSyncSettings() {
    githubToken = document.getElementById('githubToken').value.trim();
    gistId = document.getElementById('gistId').value.trim();
    if (githubToken) localStorage.setItem('github-token', githubToken);
    if (gistId) localStorage.setItem('gist-id', gistId);
    showToast('Sync settings saved', 'success');
    closeSyncModal();
}

// Validate QR data
function validateSyllabusPulseData(data) {
    if (!data.githubToken && !data.gistId && !data.pin) {
        throw new Error('Not a valid Syllabus Pulse QR code');
    }
    if (data.githubToken && !data.githubToken.startsWith('ghp_')) {
        console.warn('GitHub token format may be invalid');
    }
    if (data.pin && (data.pin.length !== 4 || !/^\d+$/.test(data.pin))) {
        throw new Error('PIN must be 4 digits');
    }
    if (data.gistId && !/^[a-f0-9]+$/i.test(data.gistId)) {
        console.warn('Gist ID format may be invalid');
    }
    return true;
}

// Import QR code
async function importQRCode(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const img = new Image();
            img.onload = async function() {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const qrCode = jsQR(imageData.data, canvas.width, canvas.height);
                if (qrCode) {
                    try {
                        const data = JSON.parse(qrCode.data);
                        validateSyllabusPulseData(data);
                        githubToken = data.githubToken || '';
                        gistId = data.gistId || '';
                        const pin = data.pin || '';
                        if (!pin) throw new Error('Missing pin in QR data');
                        // Autofill form inputs
                        document.getElementById('githubToken').value = githubToken;
                        document.getElementById('gistId').value = gistId;
                        // Save data to localStorage
                        const pinHash = await hashPin(pin);
                        localStorage.setItem('github-token', githubToken);
                        localStorage.setItem('gist-id', gistId);
                        localStorage.setItem('pinHash', pinHash);
                        localStorage.setItem('setupCompleted', 'true');
                        showToast('Setup imported successfully', 'success');
                        setTimeout(() => {
                            window.location.href = '/index.html';
                        }, 1500);
                    } catch (err) {
                        showToast(`Failed to import setup: ${err.message}`, 'error');
                        console.error('QR import error:', err);
                    }
                } else {
                    showToast('Failed to import setup: No QR code found in image', 'error');
                    console.error('QR import error: No QR code found');
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

// Show toast notification
function showToast(message, type) {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');
    toastMessage.textContent = message;
    toast.classList.remove('success', 'error');
    toast.classList.add(type);
    toastIcon.className = type === 'success' ? 'ri-check-line' : 'ri-error-warning-line';
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Initialize setup
initSetup();