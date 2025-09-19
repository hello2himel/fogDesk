let currentStep = 1;
let pinInput1 = ''; // Initial PIN
let pinInput2 = ''; // Confirmation PIN
let githubToken = '';
let gistId = '';

// Initialize setup
window.initSetup = function() {
    if (localStorage.getItem('setupCompleted') === 'true') {
        window.location.href = '/index.html';
        return;
    }
    window.showStep(1);
}

// Show specific step
window.showStep = function(step) {
    console.log(`Showing step ${step}`);
    document.querySelectorAll('.wizard-panel').forEach(panel => {
        panel.classList.add('hidden');
    });
    const panel = document.getElementById(`wizardStep${step}`);
    if (panel) {
        panel.classList.remove('hidden');
    } else {
        console.error(`Panel wizardStep${step} not found`);
        window.showToast(`Error: Step ${step} not found`, 'error');
        return;
    }
    window.updateProgress(step);
    currentStep = step;
    if (step === 3 || step === 4) {
        if (step === 3) pinInput1 = '';
        if (step === 4) pinInput2 = '';
        window.updatePinDisplay();
        document.getElementById(`pinError${step - 2}`).classList.add('hidden');
    }
}

// Update progress indicators
window.updateProgress = function(step) {
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

// Navigation functions
window.nextStep = function(step) {
    console.log(`Next step triggered: ${step}`);
    if (step === 4 && (pinInput1.length !== 4 || !/^\d{4}$/.test(pinInput1))) {
        window.showToast('Initial PIN must be exactly 4 digits', 'error');
        document.getElementById('pinError1').textContent = 'Initial PIN must be exactly 4 digits';
        document.getElementById('pinError1').classList.remove('hidden');
        return;
    }
    window.showStep(step);
}

window.prevStep = function(step) {
    console.log(`Previous step triggered: ${step}`);
    window.showStep(step);
}

// PIN entry functions
window.enterPinDigit = function(digit) {
    if (currentStep === 3 && pinInput1.length < 4) {
        pinInput1 += digit;
    } else if (currentStep === 4 && pinInput2.length < 4) {
        pinInput2 += digit;
    }
    window.updatePinDisplay();
}

window.clearPin = function() {
    if (currentStep === 3) {
        pinInput1 = '';
        document.getElementById('pinError1').classList.add('hidden');
    } else if (currentStep === 4) {
        pinInput2 = '';
        document.getElementById('pinError2').classList.add('hidden');
    }
    window.updatePinDisplay();
}

window.updatePinDisplay = function() {
    if (currentStep === 3) {
        for (let i = 1; i <= 4; i++) {
            const digit = document.getElementById(`pinDigit${i}`);
            digit.classList.toggle('filled', i <= pinInput1.length);
        }
    } else if (currentStep === 4) {
        for (let i = 5; i <= 8; i++) {
            const digit = document.getElementById(`pinDigit${i}`);
            digit.classList.toggle('filled', i - 4 <= pinInput2.length);
        }
    }
}

// Hash PIN for secure storage
window.hashPin = async function(pin) {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(pin);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
        window.showToast('Failed to hash PIN: ' + error.message, 'error');
        throw error;
    }
}

// Complete setup
window.completeSetup = async function() {
    if (pinInput2.length !== 4 || !/^\d{4}$/.test(pinInput2)) {
        window.showToast('Confirmation PIN must be exactly 4 digits', 'error');
        document.getElementById('pinError2').textContent = 'Confirmation PIN must be exactly 4 digits';
        document.getElementById('pinError2').classList.remove('hidden');
        return;
    }
    if (pinInput1 !== pinInput2) {
        window.showToast('PINs do not match', 'error');
        document.getElementById('pinError2').textContent = 'PINs do not match';
        document.getElementById('pinError2').classList.remove('hidden');
        return;
    }
    try {
        const hashedPin = await window.hashPin(pinInput1);
        localStorage.setItem('pinHash', hashedPin);
        localStorage.setItem('setupCompleted', 'true');
        window.showToast('Setup completed successfully!', 'success');
        setTimeout(() => {
            window.location.href = '/index.html';
        }, 1500);
    } catch (error) {
        window.showToast('Failed to complete setup: ' + error.message, 'error');
        document.getElementById('pinError2').textContent = 'Failed to complete setup';
        document.getElementById('pinError2').classList.remove('hidden');
        console.error('Setup error:', error);
    }
}

// Sync modal functions
window.openSyncModal = function() {
    const modal = document.getElementById('syncModal');
    modal.classList.remove('hidden');
}

window.closeSyncModal = function() {
    const modal = document.getElementById('syncModal');
    modal.classList.add('hidden');
    document.getElementById('githubToken').value = '';
    document.getElementById('gistId').value = '';
    document.getElementById('loadingOverlay').classList.add('hidden');
}

// Save sync settings
window.saveSyncSettings = function() {
    try {
        githubToken = document.getElementById('githubToken').value.trim();
        gistId = document.getElementById('gistId').value.trim();
        if (githubToken) localStorage.setItem('github-token', githubToken);
        if (gistId) localStorage.setItem('gist-id', gistId);
        localStorage.setItem('setupCompleted', 'true');
        window.showToast('Sync settings saved', 'success');
        setTimeout(() => {
            window.location.href = '/index.html';
        }, 1500);
    } catch (error) {
        window.showToast('Failed to save sync settings: ' + error.message, 'error');
        console.error('Save sync error:', error);
    }
}

// Validate QR data
window.validateSyllabusPulseData = function(data) {
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
window.importQRCode = async function(event) {
    const file = event.target.files[0];
    if (!file) {
        window.showToast('No file selected', 'error');
        return;
    }

    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    loadingText.textContent = 'Loading... Uploading QR code';
    loadingOverlay.classList.remove('hidden');

    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const img = new Image();
                img.onload = async function() {
                    try {
                        loadingText.textContent = 'Loading... Retrieving data';
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const qrCode = jsQR(imageData.data, canvas.width, canvas.height);
                        if (!qrCode) {
                            throw new Error('No QR code found in image');
                        }

                        const data = JSON.parse(qrCode.data);
                        window.validateSyllabusPulseData(data);
                        githubToken = data.githubToken || '';
                        gistId = data.gistId || '';
                        const pin = data.pin || '';
                        if (!pin) throw new Error('Missing PIN in QR data');

                        // Autofill form inputs
                        document.getElementById('githubToken').value = githubToken;
                        document.getElementById('gistId').value = gistId;

                        // Save PIN to localStorage
                        const pinHash = await window.hashPin(pin);
                        localStorage.setItem('pinHash', pinHash);
                        localStorage.setItem('github-token', githubToken);
                        localStorage.setItem('gist-id', gistId);

                        loadingOverlay.classList.add('hidden');
                        window.showToast('QR code imported successfully', 'success');
                    } catch (err) {
                        loadingOverlay.classList.add('hidden');
                        window.showToast(`Failed to import QR code: ${err.message}`, 'error');
                        console.error('QR import error:', err);
                    }
                };
                img.onerror = function() {
                    loadingOverlay.classList.add('hidden');
                    window.showToast('Failed to load QR image', 'error');
                    console.error('QR image load error');
                };
                img.src = e.target.result;
            } catch (err) {
                loadingOverlay.classList.add('hidden');
                window.showToast(`Failed to read QR file: ${err.message}`, 'error');
                console.error('QR file read error:', err);
            }
        };
        reader.onerror = function() {
            loadingOverlay.classList.add('hidden');
            window.showToast('Failed to read QR file', 'error');
            console.error('QR file read error');
        };
        reader.readAsDataURL(file);
    } catch (err) {
        loadingOverlay.classList.add('hidden');
        window.showToast(`Failed to process QR code: ${err.message}`, 'error');
        console.error('QR process error:', err);
    }
}

// Show toast notification
window.showToast = function(message, type) {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');
    toastMessage.textContent = message;
    toast.classList.remove('success', 'error');
    toast.classList.add(type);
    toastIcon.className = type === 'success' ? 'ri-check-line' : 'ri-error-warning-line';
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Initialize setup
window.initSetup();