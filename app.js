/**
 * Echo Kids Check-In Kiosk – JavaScript Controller
 * Clean, lightweight vanilla JS for iPad landscape kiosk check-in
 * Loads Google Form configuration dynamically from window.APP_CONFIG (generated via Netlify Env Vars)
 */

(() => {
  'use strict';

  const STORAGE_KEY_COUNTER = 'echokids_pickup_counter';
  const DEFAULT_START_COUNTER = 200;

  /**
   * Helper: Retrieve runtime configuration from window.APP_CONFIG
   */
  const getConfig = () => {
    return window.APP_CONFIG || {};
  };

  // DOM Elements - Check-in Form
  const form = document.getElementById('checkinForm');
  const kioskScaler = document.getElementById('kioskScaler');
  const childNameInput = document.getElementById('childName');
  const parentNameInput = document.getElementById('parentName');
  const parentPhoneInput = document.getElementById('parentPhone');
  const pickupToggle = document.getElementById('pickupToggle');
  const pickupEntry = document.getElementById('pickupEntry');
  const pickupCodeEntry = document.getElementById('pickupCodeEntry');
  const consentCheck = document.getElementById('consentCheck');
  const consentCard = document.getElementById('consentCard');
  const submitBtn = document.getElementById('submitBtn');

  // Error containers
  const childNameError = document.getElementById('childNameError');
  const parentNameError = document.getElementById('parentNameError');
  const parentPhoneError = document.getElementById('parentPhoneError');
  const consentError = document.getElementById('consentError');

  // DOM Elements - Confirmation View
  const confirmationView = document.getElementById('confirmationView');
  const displayPickupCode = document.getElementById('displayPickupCode');
  const qrContainer = document.getElementById('qrcode');
  const nextChildBtn = document.getElementById('nextChildBtn');

  /**
   * 1. Multi-iPad Starting Number (?start=) & Counter Management
   */
  const initCounter = () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const startParam = urlParams.get('start');
      if (startParam && /^\d+$/.test(startParam.trim())) {
        const startVal = parseInt(startParam.trim(), 10);
        if (startVal > 0) {
          localStorage.setItem(STORAGE_KEY_COUNTER, startVal.toString());
          console.info(`Echo Kids Kiosk: Counter initialized to ${startVal} from ?start= URL parameter.`);
          return startVal;
        }
      }
    } catch (e) {
      console.warn('URL parameter parsing failed:', e);
    }

    const stored = localStorage.getItem(STORAGE_KEY_COUNTER);
    const parsed = parseInt(stored, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }

    // Default starting counter
    localStorage.setItem(STORAGE_KEY_COUNTER, DEFAULT_START_COUNTER.toString());
    return DEFAULT_START_COUNTER;
  };

  const getAndIncrementCounter = () => {
    let current = parseInt(localStorage.getItem(STORAGE_KEY_COUNTER), 10);
    if (isNaN(current) || current <= 0) {
      current = DEFAULT_START_COUNTER;
    }
    const next = current + 1;
    localStorage.setItem(STORAGE_KEY_COUNTER, next.toString());
    return current;
  };

  /**
   * 2. Pickup Code Generator: <counter>_[A-Z]{4}
   */
  const generateRandomLetters = (length = 4) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const generatePickupCode = () => {
    const counter = getAndIncrementCounter();
    const letters = generateRandomLetters(4);
    return `${counter}_${letters}`;
  };

  // Run initialization
  initCounter();

  /**
   * 3. Sync Pickup Toggle state with hidden form entry for Google Forms
   */
  const syncPickupState = () => {
    pickupEntry.value = pickupToggle.checked ? 'True' : 'False';
  };

  pickupToggle.addEventListener('change', syncPickupState);
  syncPickupState(); // ensure initial value

  /**
   * 4. Validation Helpers (German messages)
   */
  const validateField = (input, errorEl, message, validatorFn) => {
    const isValid = validatorFn(input.value.trim());
    if (!isValid) {
      input.classList.add('is-invalid');
      errorEl.textContent = message;
    } else {
      input.classList.remove('is-invalid');
      errorEl.textContent = '';
    }
    return isValid;
  };

  const isNotEmpty = val => val.length >= 2;
  const isValidPhone = val => {
    const stripped = val.replace(/[\s\-\/\(\)]/g, '');
    return /^[+]?[0-9]{5,20}$/.test(stripped);
  };

  // Real-time error clearing on input
  childNameInput.addEventListener('input', () => {
    if (childNameInput.classList.contains('is-invalid')) {
      validateField(childNameInput, childNameError, 'Bitte gib den Namen des Kindes ein.', isNotEmpty);
    }
  });

  parentNameInput.addEventListener('input', () => {
    if (parentNameInput.classList.contains('is-invalid')) {
      validateField(parentNameInput, parentNameError, 'Bitte gib den Namen der Eltern ein.', isNotEmpty);
    }
  });

  parentPhoneInput.addEventListener('input', () => {
    if (parentPhoneInput.classList.contains('is-invalid')) {
      validateField(parentPhoneInput, parentPhoneError, 'Bitte gib eine gültige Telefonnummer ein.', isValidPhone);
    }
  });

  consentCheck.addEventListener('change', () => {
    if (consentCheck.checked) {
      consentCard.classList.remove('is-invalid');
      consentError.textContent = '';
    }
  });

  const validateForm = () => {
    let isValid = true;

    if (!validateField(childNameInput, childNameError, 'Bitte gib den Namen des Kindes ein.', isNotEmpty)) {
      isValid = false;
    }

    if (!validateField(parentNameInput, parentNameError, 'Bitte gib den Namen der Eltern ein.', isNotEmpty)) {
      isValid = false;
    }

    if (!validateField(parentPhoneInput, parentPhoneError, 'Bitte gib eine gültige Telefonnummer ein (mind. 5 Ziffern).', isValidPhone)) {
      isValid = false;
    }

    if (!consentCheck.checked) {
      consentCard.classList.add('is-invalid');
      consentError.textContent = 'Bitte bestätige die Datenschutz- und Event-Einwilligung.';
      isValid = false;
    } else {
      consentCard.classList.remove('is-invalid');
      consentError.textContent = '';
    }

    queueFormFitUpdate();
    return isValid;
  };

  /**
   * 5. QR Code & Confirmation View Management (Privacy First)
   */
  const showConfirmationScreen = (code, kidName, parentName) => {
    // Hide form, reveal confirmation view
    form.classList.add('hidden');
    confirmationView.classList.remove('hidden');

    document.body.classList.remove('keyboard-active');
    if (kioskScaler) {
      kioskScaler.style.transform = '';
      kioskScaler.style.marginBottom = '';
    }

    // On-Screen Privacy: Display ONLY the generated pickup code
    displayPickupCode.textContent = code;

    // Generate crisp QR code client-side pointing to /pickup
    qrContainer.innerHTML = '';
    const origin = window.location.origin || `${window.location.protocol}//${window.location.host}`;
    const pickupUrl = `${origin}/pickup?kid=${encodeURIComponent(kidName)}&parent=${encodeURIComponent(parentName)}&code=${encodeURIComponent(code)}`;

    if (typeof QRCode !== 'undefined') {
      new QRCode(qrContainer, {
        text: pickupUrl,
        width: 180,
        height: 180,
        colorDark: '#08415C',
        colorLight: '#FFFFFF',
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      console.error('QRCode library not loaded');
      qrContainer.innerHTML = `<a href="${pickupUrl}" target="_blank" style="font-size:13px;color:#08415C;">Abholpass-Link öffnen</a>`;
    }
  };

  /**
   * 6. Reset Form & Return to Check-In Screen ("Nächstes Kind anmelden")
   */
  const resetToNextChild = () => {
    // Switch views
    confirmationView.classList.add('hidden');
    form.classList.remove('hidden');

    // Reset inputs
    form.reset();

    // Reset default states
    pickupToggle.checked = true;
    syncPickupState();
    pickupCodeEntry.value = '';
    consentCheck.checked = false;

    // Clear validation styling
    [childNameInput, parentNameInput, parentPhoneInput, consentCard].forEach(el => {
      el.classList.remove('is-invalid');
    });
    [childNameError, parentNameError, parentPhoneError, consentError].forEach(el => {
      el.textContent = '';
    });

    // Reset submit button state
    submitBtn.classList.remove('is-submitting');
    submitBtn.disabled = false;

    // Recalculate layout fit and focus first field
    queueFormFitUpdate();
    childNameInput.focus();
  };

  nextChildBtn.addEventListener('click', resetToNextChild);

  /**
   * 7. Form Submission Handler
   */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const config = getConfig();
    const actionUrl = config.FORM_ACTION_URL || `https://docs.google.com/forms/d/e/${config.GOOGLE_FORM_ID}/formResponse`;

    // Capture values before form is submitted
    const kidName = childNameInput.value.trim();
    const parentName = parentNameInput.value.trim();
    const parentPhone = parentPhoneInput.value.trim();

    // Generate unique pickup code (<counter>_XXXX)
    const pickupCode = generatePickupCode();
    pickupCodeEntry.value = pickupCode;

    // Visual button state
    submitBtn.classList.add('is-submitting');
    submitBtn.disabled = true;

    // Prepare URL-encoded form data dynamically based on window.APP_CONFIG
    const searchParams = new URLSearchParams();
    if (config.ENTRY_KID_NAME) searchParams.append(config.ENTRY_KID_NAME, kidName);
    if (config.ENTRY_PARENT_NAME) searchParams.append(config.ENTRY_PARENT_NAME, parentName);
    if (config.ENTRY_PARENT_PHONE) searchParams.append(config.ENTRY_PARENT_PHONE, parentPhone);
    if (config.ENTRY_PICKUP_PERMISSION) searchParams.append(config.ENTRY_PICKUP_PERMISSION, pickupToggle.checked ? 'True' : 'False');
    if (config.ENTRY_PICKUP_CODE) searchParams.append(config.ENTRY_PICKUP_CODE, pickupCode);
    if (config.ENTRY_CONSENT) searchParams.append(config.ENTRY_CONSENT, 'True');

    try {
      // 1. Fetch async submission with no-cors mode
      await fetch(actionUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: searchParams.toString()
      });
      showConfirmationScreen(pickupCode, kidName, parentName);
    } catch (err) {
      // Fallback: Submit via hidden iframe in case fetch is blocked by kiosk network policy
      try {
        form.action = actionUrl;
        if (config.ENTRY_KID_NAME) childNameInput.name = config.ENTRY_KID_NAME;
        if (config.ENTRY_PARENT_NAME) parentNameInput.name = config.ENTRY_PARENT_NAME;
        if (config.ENTRY_PARENT_PHONE) parentPhoneInput.name = config.ENTRY_PARENT_PHONE;
        if (config.ENTRY_PICKUP_PERMISSION) pickupEntry.name = config.ENTRY_PICKUP_PERMISSION;
        if (config.ENTRY_PICKUP_CODE) pickupCodeEntry.name = config.ENTRY_PICKUP_CODE;
        if (config.ENTRY_CONSENT) consentCheck.name = config.ENTRY_CONSENT;

        form.submit();
        showConfirmationScreen(pickupCode, kidName, parentName);
      } catch (submitErr) {
        console.error('Submission error:', submitErr);
        submitBtn.classList.remove('is-submitting');
        submitBtn.disabled = false;
        alert('Beim Übertragen ist ein Fehler aufgetreten. Bitte erneut versuchen.');
      }
    }
  });

  /**
   * 8. Virtual Keyboard Adaptation & Auto-Scale Fallback
   * Detects visual viewport shrinking above the on-screen keyboard,
   * activates compact layout mode, and applies dynamic transform: scale(...)
   * with transform-origin: top center to the entire content container (#kioskScaler)
   * so all 3 inputs, checkboxes, and the submit CTA fit cleanly without scrolling.
   */
  const updateFormFitAboveKeyboard = () => {
    if (!kioskScaler) {
      return;
    }

    const vv = window.visualViewport;
    const viewportHeight = vv ? vv.height : window.innerHeight;

    // Reset scaling and bottom offset to measure natural unscaled height accurately
    kioskScaler.style.transform = '';
    kioskScaler.style.marginBottom = '';

    // Measure total natural height of the entire content (header + logo + form)
    const contentHeight = kioskScaler.offsetHeight;

    // Safe vertical padding (top and bottom gutters)
    const verticalGutters = 16;
    const availableHeight = viewportHeight - verticalGutters;

    // Detect if viewport height is reduced (by on-screen keyboard, small window, or DevTools resize)
    const isReducedHeight = viewportHeight < 650 || (contentHeight > 0 && availableHeight < contentHeight);
    document.body.classList.toggle('keyboard-active', isReducedHeight);

    // Auto-scale fallback: If content exceeds available height, scale the ENTIRE content proportionally
    if (contentHeight > 0 && availableHeight < contentHeight) {
      const scale = Math.min(1, Math.max(0.40, availableHeight / contentHeight));
      kioskScaler.style.transform = `scale(${scale.toFixed(3)})`;
      kioskScaler.style.transformOrigin = 'top center';

      // Counteract the layout box height overflow to eliminate unwanted scrolling
      const heightDifference = contentHeight * (1 - scale);
      kioskScaler.style.marginBottom = `-${heightDifference}px`;
    } else {
      kioskScaler.style.transform = '';
      kioskScaler.style.marginBottom = '';
    }
  };

  let resizeRaf = null;
  const queueFormFitUpdate = () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      updateFormFitAboveKeyboard();
    });
  };

  // Listen to visualViewport API (Chrome, Safari iOS, Edge, Android)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', queueFormFitUpdate);
    window.visualViewport.addEventListener('scroll', () => {
      // Prevent unwanted iOS Safari scroll offsets when focusing fields in landscape
      if (document.body.classList.contains('keyboard-active') && window.scrollY > 0) {
        window.scrollTo(0, 0);
      }
      queueFormFitUpdate();
    });
  }

  window.addEventListener('resize', queueFormFitUpdate);
  window.addEventListener('orientationchange', () => {
    setTimeout(queueFormFitUpdate, 150);
  });

  // Track field focus and blur events with iOS virtual keyboard animation timing
  [childNameInput, parentNameInput, parentPhoneInput].forEach(input => {
    if (!input) return;
    input.addEventListener('focus', () => {
      setTimeout(queueFormFitUpdate, 80);
      setTimeout(queueFormFitUpdate, 320);
    });
    input.addEventListener('blur', () => {
      setTimeout(queueFormFitUpdate, 100);
      setTimeout(queueFormFitUpdate, 300);
    });
  });

  // Run on initial load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', queueFormFitUpdate);
  } else {
    queueFormFitUpdate();
  }

})();
