let githubToken = '';
let gistId = '';
let wizardPinInput = '';

// Start the setup wizard
function startSetupWizard() {
    if (localStorage.getItem('setupCompleted') === 'true') {
        window.location.href = '/index.html';
    } else {
        document.getElementById('setupWizard').classList.remove('hidden');
        showWizardStep(1);
    }
}

// Show specific wizard step
function showWizardStep(step) {
    document.getElementById('wizardStep1').classList.add('hidden');
    document.getElementById('wizardStep2').classList.add('hidden');
    document.getElementById('wizardStep3').classList.add('hidden');
    document.getElementById(`wizardStep${step}`).classList.remove('hidden');
    if (step === 3) {
        wizardPinInput = '';
        updateWizardPinDisplay();
        document.getElementById('wizardPinError').classList.add('hidden');
    }
}

// Open sync modal
function openSyncModal() {
    document.getElementById('syncModal').classList.remove('hidden');
}

// Close sync modal
function closeSyncModal() {
    document.getElementById('syncModal').classList.add('hidden');
    document.getElementById('wizardGithubToken').value = '';
    document.getElementById('wizardGistId').value = '';
}

// Save sync settings
function saveSyncSettings() {
    githubToken = document.getElementById('wizardGithubToken').value.trim();
    gistId = document.getElementById('wizardGistId').value.trim();
    if (githubToken) localStorage.setItem('github-token', githubToken);
    if (gistId) localStorage.setItem('gist-id', gistId);
    showToast('Sync settings saved', 'success');
}

// PIN entry handling
function enterWizardPinDigit(digit) {
    if (wizardPinInput.length < 4) {
        wizardPinInput += digit;
        updateWizardPinDisplay();
        document.getElementById('wizardPinError').classList.add('hidden');
    }
}

function clearWizardPin() {
    wizardPinInput = '';
    updateWizardPinDisplay();
    document.getElementById('wizardPinError').classList.add('hidden');
}

function updateWizardPinDisplay() {
    for (let i = 1; i <= 4; i++) {
        const digitSpan = document.getElementById(`wizardPinDigit${i}`);
        if (i <= wizardPinInput.length) {
            digitSpan.classList.add('filled');
        } else {
            digitSpan.classList.remove('filled');
        }
    }
}

// Complete setup
async function completeSetup() {
    if (wizardPinInput.length === 4 && /^\d+$/.test(wizardPinInput)) {
        const pinHash = await hashPin(wizardPinInput);
        localStorage.setItem('pinHash', pinHash);
        localStorage.setItem('setupCompleted', 'true');
        document.getElementById('setupWizard').classList.add('hidden');
        window.location.href = '/index.html';
    } else {
        document.getElementById('wizardPinError').classList.remove('hidden');
        document.getElementById('wizardPinError').textContent = 'PIN must be 4 digits';
    }
}

// Hash PIN for storage
async function hashPin(pin) {
    const enc = new TextEncoder();
    const data = enc.encode(pin);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
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

// Import Gist via QR code
async function importGistQR(event) {
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
                        const pinHash = await hashPin(pin);
                        localStorage.setItem('github-token', githubToken);
                        localStorage.setItem('gist-id', gistId);
                        localStorage.setItem('pinHash', pinHash);
                        localStorage.setItem('setupCompleted', 'true');
                        document.getElementById('wizardGithubToken').value = '';
                        document.getElementById('wizardGistId').value = '';
                        document.getElementById('setupWizard').classList.add('hidden');
                        closeSyncModal();
                        showToast('Setup imported successfully', 'success');
                        window.location.href = '/index.html';
                    } catch (err) {
                        showToast(`Failed to import setup: ${err.message}`, 'error');
                    }
                } else {
                    showToast('Failed to import setup: No QR code found in image', 'error');
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
    toast.textContent = message;
    toast.classList.add(type);
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
        toast.classList.remove(type);
    }, 3000);
}

// Initialize setup
startSetupWizard();