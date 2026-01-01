let session = { subject: "", type: "", year: "", mode: "" };
let currentExamData = null;
let currentQuestionIndex = 0;
let timerInterval = null;
let timerSeconds = 0;
let isPaused = false;
let examState = { answers: {}, startTime: null, elapsedTime: 0 };

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const themeIcon = document.getElementById('theme-icon');
    
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (themeIcon) {
        updateThemeIcon(themeIcon, savedTheme);
    }
    
    setTimeout(() => {
        document.body.classList.remove('preload');
    }, 100);
}

function updateThemeIcon(icon, theme) {
    if (theme === 'dark') {
        icon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
    } else {
        icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    const themeIcon = document.getElementById('theme-icon');
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    if (themeIcon) {
        updateThemeIcon(themeIcon, newTheme);
    }
}

const routes = {
    'home': 0,
    'subject': 1,
    'type': 2,
    'year': 3,
    'mode': 4,
    'exam': 5,
    'results': 6,
    'history': 7,
    'contact': 8
};

function clearAllExamStates() {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.startsWith('exam_state_')) {
            localStorage.removeItem(key);
        }
    });
    examState = { answers: {}, startTime: null, elapsedTime: 0 };
}

function navigateTo(stepName, pushState = true) {
    const stepNumber = routes[stepName];
    document.querySelectorAll(".step-section").forEach(s => s.classList.remove("active"));
    document.getElementById(`step-${stepNumber}`).classList.add("active");

    if (stepName === 'home') {
        clearAllExamStates();
        if (timerInterval) {
            clearInterval(timerInterval);
        }
    }

    if (pushState) {
        const url = stepName === 'home' ? window.location.pathname : `?step=${stepName}`;
        history.pushState({ step: stepName }, "", url);
    }
}

window.onpopstate = function(event) {
    if (event.state && event.state.step) {
        navigateTo(event.state.step, false);
    } else {
        navigateTo('home', false);
    }
};

function setSession(key, val) {
    session[key] = val.toLowerCase();
    localStorage.setItem('stem_session', JSON.stringify(session));
    
    if (key === "mode") {
        startExam(session.year);
    } else {
        const nextStep = key === "subject" ? 'type' : key === "type" ? 'year' : key === "year" ? 'mode' : 'exam';
        if (nextStep === 'year') {
            renderYearButtons();
        }
        navigateTo(nextStep);
    }
}

async function checkExamAvailability(year) {
    const filePath = `exams/${session.subject}/${session.type}/${year}.json`;
    try {
        const res = await fetch(filePath, { method: 'HEAD', cache: 'no-store' });
        return res.ok;
    } catch (err) {
        return false;
    }
}

async function renderYearButtons() {
    const years = ['2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015'];
    const container = document.getElementById('year-buttons-container');
    
    if (!container) return;

    container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Checking availability...</p>';
    
    let html = '';
    const availabilityChecks = await Promise.all(
        years.map(year => checkExamAvailability(year))
    );
    
    years.forEach((year, index) => {
        const isAvailable = availabilityChecks[index];
        const result = getExamResult(session.subject, session.type, year);
        let buttonClass = 'btn-choice';
        let badgeHtml = '';
        let availabilityText = '';
        
        if (isAvailable) {
            availabilityText = '<span class="availability-badge available">(available)</span>';
        } else {
            buttonClass += ' unavailable';
            availabilityText = '<span class="availability-badge unavailable">(not available)</span>';
        }
        
        if (result) {
            buttonClass += ' completed';
            const percentage = result.bestPercentage;
            badgeHtml = `<span class="completion-badge">${percentage}%</span>`;
        }
        
        const onClickHandler = isAvailable ? `onclick="setSession('year','${year}')"` : '';
        const disabledAttr = isAvailable ? '' : 'disabled';
        
        html += `<button class="${buttonClass}" ${onClickHandler} ${disabledAttr}>${year} ${availabilityText}${badgeHtml}</button>`;
    });
    
    container.innerHTML = html;
}

function saveExamState() {
    if (!currentExamData || session.mode !== 'full') return;
    
    examState.answers = {};
    currentExamData.questions.forEach((q, i) => {
        const selected = document.querySelector(`input[name="q${i}"]:checked`);
        if (selected) {
            examState.answers[i] = Number(selected.value);
        }
    });
    
    examState.elapsedTime = getExamDuration() * 60 - timerSeconds;
    examState.startTime = Date.now() - (examState.elapsedTime * 1000);
    
    const stateKey = `exam_state_${session.subject}_${session.type}_${session.year}`;
    localStorage.setItem(stateKey, JSON.stringify(examState));
}

function loadExamState() {
    if (!currentExamData || session.mode !== 'full') return false;
    
    const stateKey = `exam_state_${session.subject}_${session.type}_${session.year}`;
    const saved = localStorage.getItem(stateKey);
    
    if (saved) {
        try {
            examState = JSON.parse(saved);
            return true;
        } catch (e) {
            console.error('Failed to load exam state:', e);
        }
    }
    return false;
}

function clearExamState() {
    const stateKey = `exam_state_${session.subject}_${session.type}_${session.year}`;
    localStorage.removeItem(stateKey);
    examState = { answers: {}, startTime: null, elapsedTime: 0 };
}

function restoreExamState() {
    if (!loadExamState()) return;
    
    Object.keys(examState.answers).forEach(questionIndex => {
        const answerIndex = examState.answers[questionIndex];
        const radio = document.querySelector(`input[name="q${questionIndex}"][value="${answerIndex}"]`);
        if (radio) {
            radio.checked = true;
        }
    });
    
    const examDuration = getExamDuration() * 60;
    timerSeconds = Math.max(0, examDuration - examState.elapsedTime);
    updateTimerDisplay();
    updateProgressBar();
    
    // Apply pause state to restored answers
    if (isPaused) {
        const answerOptions = document.querySelectorAll('input[type="radio"]');
        answerOptions.forEach(radio => {
            radio.disabled = true;
        });
        
        const optionLabels = document.querySelectorAll('.option-label');
        optionLabels.forEach(label => {
            label.style.opacity = '0.5';
            label.style.pointerEvents = 'none';
        });
    }
}

function startTimer() {
    if (session.mode === 'full') {
        // Clear any existing timer before starting a new one
        if (timerInterval) {
            clearInterval(timerInterval);
        }
        
        const examDuration = getExamDuration() * 60;
        
        if (loadExamState() && examState.startTime) {
            const elapsedSinceStart = Math.floor((Date.now() - examState.startTime) / 1000);
            timerSeconds = Math.max(0, examDuration - elapsedSinceStart);
        } else {
            timerSeconds = examDuration;
            examState.startTime = Date.now();
        }
        
        updateTimerDisplay();
        let warningShown = false;
        
        timerInterval = setInterval(() => {
            if (!isPaused) {
                timerSeconds--;
                updateTimerDisplay();
                updateProgressBar();
                saveExamState();
                
                if (timerSeconds === 300 && !warningShown) {
                    showTimeWarning();
                    warningShown = true;
                }
                
                if (timerSeconds <= 0) {
                    clearInterval(timerInterval);
                    processResults();
                }
            }
        }, 1000);
    }
}

function getExamDuration() {
    const baseDurations = {
        'urt': 120,
        'toc': 90
    };
    return baseDurations[session.type] || 120;
}

function updateTimerDisplay() {
    const hours = Math.floor(timerSeconds / 3600);
    const minutes = Math.floor((timerSeconds % 3600) / 60);
    const seconds = timerSeconds % 60;
    const display = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    const timerElement = document.getElementById('timer-text');
    timerElement.textContent = display;
    
    if (timerSeconds <= 60) {
        timerElement.style.color = 'var(--error)';
        timerElement.style.animation = 'pulse 1s infinite';
    } else {
        timerElement.style.color = 'var(--primary)';
        timerElement.style.animation = 'none';
    }
}

function updateProgressBar() {
    const examDuration = getExamDuration() * 60;
    const progress = ((examDuration - timerSeconds) / examDuration) * 100;
    document.getElementById('progress-fill').style.width = `${progress}%`;
}

function toggleTimer() {
    isPaused = !isPaused;
    document.getElementById('pause-btn').textContent = isPaused ? 'Resume' : 'Pause';
    
    const answerOptions = document.querySelectorAll('input[type="radio"]');
    answerOptions.forEach(radio => {
        radio.disabled = isPaused;
    });
    
    const optionLabels = document.querySelectorAll('.option-label');
    optionLabels.forEach(label => {
        if (isPaused) {
            label.style.opacity = '0.5';
            label.style.pointerEvents = 'none';
        } else {
            label.style.opacity = '1';
            label.style.pointerEvents = 'auto';
        }
    });
}

function showTimeWarning() {
    const warningDiv = document.createElement('div');
    warningDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--error);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 1000;
        font-weight: bold;
        animation: slideInRight 0.3s ease;
    `;
    warningDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>Only 5 minutes remaining!</span>
        </div>
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(warningDiv);
    
    setTimeout(() => {
        warningDiv.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => {
            if (warningDiv.parentNode) {
                warningDiv.parentNode.removeChild(warningDiv);
            }
        }, 300);
    }, 5000);
}

function resetTimer() {
    clearInterval(timerInterval);
    timerSeconds = getExamDuration() * 60;
    isPaused = false;
    document.getElementById('pause-btn').textContent = 'Pause';
    updateTimerDisplay();
    updateProgressBar();
    
    // Clear all answers
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.checked = false;
        radio.disabled = false;
    });
    
    // Re-enable option labels
    const optionLabels = document.querySelectorAll('.option-label');
    optionLabels.forEach(label => {
        label.style.opacity = '1';
        label.style.pointerEvents = 'auto';
    });
    
    // Clear saved state
    clearExamState();
    examState.startTime = Date.now();
    
    startTimer();
}

async function startExam(year) {
    const isAvailable = await checkExamAvailability(year);
    if (!isAvailable) {
        alert(`The exam for ${year} is not available.`);
        return;
    }
    
    session.year = year;
    localStorage.setItem('stem_session', JSON.stringify(session));
    const filePath = `exams/${session.subject}/${session.type}/${session.year}.json`;

    try {
        const cacheBusted = `${filePath}?_=${Date.now()}`;
        const res = await fetch(cacheBusted, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        currentExamData = await res.json();
        currentQuestionIndex = 0;
        renderExam();
        navigateTo('exam');
        if (session.mode === 'full') {
            startTimer();
        }
    } catch (err) {
        console.error('Failed to load exam data:', err);
        alert("Exam data could not be loaded!");
    }
}

function getImagesHtml(q, inReview = false) {
    const imageClass = inReview ? 'question-image review-image' : 'question-image';
    if (q.images && Array.isArray(q.images)) {
        return `<div class="image-grid">${q.images.map(imgSrc => `<img src="${imgSrc}" class="${imageClass}">`).join("")}</div>`;
    } else if (q.image) {
        return `<img src="${q.image}" class="${imageClass}">`;
    }
    return "";
}

function renderExam() {
    const title = `${session.subject.toUpperCase()} ${session.type.toUpperCase()} - ${session.year}`;
    document.getElementById("title-display").innerText = title;

    const timerContainer = document.getElementById('timer-container');
    const questionNav = document.getElementById('question-nav');
    const submitBtn = document.getElementById('submit-exam-btn');
    const questionControls = document.getElementById('question-controls');

    if (session.mode === 'full') {
        timerContainer.style.display = 'block';
        questionNav.style.display = 'none';
        submitBtn.style.display = 'inline-block';
        questionControls.style.display = 'none';
        renderFullExam();
    } else {
        timerContainer.style.display = 'none';
        questionNav.style.display = 'block';
        submitBtn.style.display = 'none';
        questionControls.style.display = 'flex';
        renderQuestionByQuestion();
    }

    if (window.MathJax) MathJax.typesetPromise();
}

function renderFullExam() {
    let html = "";
    
    currentExamData.questions.forEach((q, i) => {
        if (q.passage) {
            html += `<div class="passage-box"><strong>Passage:</strong><br>${q.passage}</div>`;
        }

        html += `
        <div class="question-card">
            <p class="question-text"><strong>Q${i + 1}:</strong> ${q.q}</p>
            ${getImagesHtml(q, false)}
            <div class="options-container">
                ${q.options.map((opt, idx) => `
                    <label class="option-label">
                        <input type="radio" name="q${i}" value="${idx}" onchange="saveExamState()"> ${opt}
                    </label>`).join("")}
            </div>
        </div>`;
    });

    document.getElementById("exam-container").innerHTML = html;
    
    // Restore state after rendering
    setTimeout(() => {
        restoreExamState();
    }, 100);
}

function renderQuestionByQuestion() {
    const q = currentExamData.questions[currentQuestionIndex];
    const totalQuestions = currentExamData.questions.length;
    
    document.getElementById('question-progress').textContent = `Question ${currentQuestionIndex + 1} of ${totalQuestions}`;
    document.getElementById('question-progress-fill').style.width = `${((currentQuestionIndex + 1) / totalQuestions) * 100}%`;
    
    let html = "";
    
    if (q.passage) {
        html += `<div class="passage-box"><strong>Passage:</strong><br>${q.passage}</div>`;
    }

    html += `
    <div class="question-card">
        <p class="question-text"><strong>Q${currentQuestionIndex + 1}:</strong> ${q.q}</p>
        ${getImagesHtml(q, false)}
        <div class="options-container">
            ${q.options.map((opt, idx) => `
                <label class="option-label">
                    <input type="radio" name="current-question" value="${idx}" onchange="checkAnswer()"> ${opt}
                </label>`).join("")}
        </div>
    </div>`;

    document.getElementById("exam-container").innerHTML = html;
    
    document.getElementById('prev-question-btn').disabled = currentQuestionIndex === 0;
    document.getElementById('next-question-btn').textContent = currentQuestionIndex === totalQuestions - 1 ? 'Finish' : 'Next';
    
    if (window.MathJax) MathJax.typesetPromise();
}

function checkAnswer() {
    const selected = document.querySelector('input[name="current-question"]:checked');
    if (!selected) return;
    
    const q = currentExamData.questions[currentQuestionIndex];
    const userIndex = Number(selected.value);
    const isCorrect = userIndex === q.correct;
    
    const allLabels = document.querySelectorAll('.option-label');
    const selectedLabel = selected.parentElement;
    const correctLabel = allLabels[q.correct];
    
    selectedLabel.classList.add(isCorrect ? 'correct' : 'incorrect');
    correctLabel.classList.add('correct-answer');
    
    document.querySelectorAll('input[name="current-question"]').forEach(input => input.disabled = true);
    
    if (window.MathJax) MathJax.typesetPromise();
}

function nextQuestion() {
    const totalQuestions = currentExamData.questions.length;
    
    if (currentQuestionIndex < totalQuestions - 1) {
        currentQuestionIndex++;
        renderQuestionByQuestion();
    } else {
        processResults();
    }
}

function previousQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderQuestionByQuestion();
    }
}

function saveExamResult(subject, type, year, score, total, timeTaken = null) {
    const resultKey = `exam_result_${subject}_${type}_${year}`;
    const percentage = Math.round((score / total) * 100);
    const timestamp = new Date().toISOString();
    
    const existingResult = getExamResult(subject, type, year);
    const attempts = existingResult ? (existingResult.attempts || 1) + 1 : 1;
    const bestScore = existingResult ? Math.max(existingResult.bestScore || existingResult.score, score) : score;
    const bestPercentage = existingResult ? Math.max(existingResult.bestPercentage || existingResult.percentage, percentage) : percentage;
    
    const result = {
        subject,
        type,
        year,
        mode: session.mode,
        score,
        total,
        percentage,
        bestScore,
        bestPercentage,
        attempts,
        timestamp,
        lastAttempt: timestamp
    };
    
    if (timeTaken !== null && session.mode === 'full') {
        result.timeTaken = timeTaken;
        if (existingResult && existingResult.timeTaken) {
            result.bestTime = Math.min(existingResult.bestTime || existingResult.timeTaken, timeTaken);
        } else {
            result.bestTime = timeTaken;
        }
    }
    
    localStorage.setItem(resultKey, JSON.stringify(result));
    
    const allResults = getAllExamResults();
    allResults[resultKey] = result;
    localStorage.setItem('all_exam_results', JSON.stringify(allResults));
    
    return result;
}

function getExamResult(subject, type, year) {
    const resultKey = `exam_result_${subject}_${type}_${year}`;
    const saved = localStorage.getItem(resultKey);
    return saved ? JSON.parse(saved) : null;
}

function getAllExamResults() {
    const saved = localStorage.getItem('all_exam_results');
    return saved ? JSON.parse(saved) : {};
}

function processResults() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    let score = 0;
    let reviewHtml = "";
    let timeTaken = null;
    
    if (session.mode === 'full') {
        const examDuration = getExamDuration() * 60;
        timeTaken = examDuration - timerSeconds;
        clearExamState();
    }
    
    if (session.mode === 'full') {
        currentExamData.questions.forEach((q, i) => {
            const selected = document.querySelector(`input[name="q${i}"]:checked`);
            const userIndex = selected ? Number(selected.value) : null;
            const isCorrect = userIndex === q.correct;
            if (isCorrect) score++;
            
            if (q.passage) {
                reviewHtml += `<div class="passage-box review-passage"><strong>Passage:</strong><br>${q.passage}</div>`;
            }

            reviewHtml += `
            <div class="review-card ${isCorrect ? "status-correct" : "status-wrong"}">
                <p class="question-text"><strong>Question ${i + 1}:</strong> ${q.q}</p>
                ${getImagesHtml(q, true)}
                <p class="${isCorrect ? "correct-tag" : "wrong-tag"}">
                    Your Answer: ${userIndex !== null ? q.options[userIndex] : "No answer"} ${isCorrect ? " ✓" : " ✗"}
                </p>
                ${!isCorrect ? `<p class="actual-answer"><strong>Correct Answer:</strong> ${q.options[q.correct]}</p>` : ""}
            </div>`;
        });
    } else {
        currentExamData.questions.forEach((q, i) => {
            const isCorrect = true;
            if (isCorrect) score++;
            
            if (q.passage) {
                reviewHtml += `<div class="passage-box review-passage"><strong>Passage:</strong><br>${q.passage}</div>`;
            }

            reviewHtml += `
            <div class="review-card status-correct">
                <p class="question-text"><strong>Question ${i + 1}:</strong> ${q.q}</p>
                ${getImagesHtml(q, true)}
                <p class="correct-tag">Completed with immediate feedback ✓</p>
            </div>`;
        });
    }

    const total = currentExamData.questions.length;
    const result = saveExamResult(session.subject, session.type, session.year, score, total, timeTaken);

    document.getElementById("raw-score-display").innerText = `${score} / ${total}`;
    let comment = score === total ? "Perfect!" : "Review your answers below.";
    if (result.attempts > 1) {
        comment += ` (Attempt ${result.attempts}, Best: ${result.bestScore}/${total})`;
    }
    document.getElementById("score-comment").innerText = comment;
    document.getElementById("review-container").innerHTML = reviewHtml;
    navigateTo('results');
    try { window.scrollTo(0, 0); } catch (e) { document.documentElement.scrollTop = 0; }
    if (window.MathJax) MathJax.typesetPromise();
}

function resetApp() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    clearAllExamStates();
    localStorage.removeItem('stem_session');
    window.location.href = window.location.pathname;
}

function showResultsHistory() {
    const allResults = getAllExamResults();
    const container = document.getElementById('history-container');
    
    if (!container) return;
    
    const resultsArray = Object.values(allResults);
    
    if (resultsArray.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No completed exams yet.</p>';
        navigateTo('history');
        return;
    }
    
    resultsArray.sort((a, b) => new Date(b.lastAttempt) - new Date(a.lastAttempt));
    
    let html = '<div class="history-grid">';
    resultsArray.forEach(result => {
        const date = new Date(result.lastAttempt).toLocaleDateString();
        const time = new Date(result.lastAttempt).toLocaleTimeString();
        const modeText = result.mode === 'full' ? 'Full-Length' : 'Question-by-Question';
        
        let timeInfo = '';
        if (result.mode === 'full' && result.timeTaken !== undefined) {
            const timeMinutes = Math.floor(result.timeTaken / 60);
            const timeSeconds = result.timeTaken % 60;
            const timeStr = `${timeMinutes}m ${timeSeconds}s`;
            
            if (result.bestTime !== undefined && result.bestTime !== result.timeTaken) {
                const bestMinutes = Math.floor(result.bestTime / 60);
                const bestSeconds = result.bestTime % 60;
                const bestStr = `${bestMinutes}m ${bestSeconds}s`;
                timeInfo = `<div class="stat-item">
                    <span class="stat-label">Time:</span>
                    <span class="stat-value">${timeStr} (Best: ${bestStr})</span>
                </div>`;
            } else {
                timeInfo = `<div class="stat-item">
                    <span class="stat-label">Time:</span>
                    <span class="stat-value">${timeStr}</span>
                </div>`;
            }
        }
        
        html += `
            <div class="history-card">
                <div class="history-header">
                    <h3>${result.subject.toUpperCase()} ${result.type.toUpperCase()} - ${result.year}</h3>
                    <span class="history-date">${date} ${time}</span>
                </div>
                <div class="history-stats">
                    <div class="stat-item">
                        <span class="stat-label">Mode:</span>
                        <span class="stat-value">${modeText}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Best Score:</span>
                        <span class="stat-value best-score">${result.bestScore} / ${result.total}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Best Percentage:</span>
                        <span class="stat-value">${result.bestPercentage}%</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Attempts:</span>
                        <span class="stat-value">${result.attempts}</span>
                    </div>
                    ${timeInfo}
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
    navigateTo('history');
}

window.onload = () => {
    initTheme();
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // Handle form submission
    const form = document.querySelector('.contact-form');
    const formStatus = document.getElementById('form-status');
    
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const submitBtn = form.querySelector('.submit-btn');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Sending...';
            submitBtn.disabled = true;
            
            const formData = new FormData(form);
            
            fetch(form.action, {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json'
                }
            })
            .then(response => {
                if (response.ok) {
                    formStatus.innerHTML = '<div class="success-message">Thank you for your message! We\'ll get back to you soon.</div>';
                    form.reset();
                } else {
                    throw new Error('Form submission failed');
                }
            })
            .catch(error => {
                formStatus.innerHTML = '<div class="error-message">Oops! There was a problem sending your message. Please try again.</div>';
            })
            .finally(() => {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                
                // Clear status message after 5 seconds
                setTimeout(() => {
                    formStatus.innerHTML = '';
                }, 5000);
            });
        });
    }
    
    const params = new URLSearchParams(window.location.search);
    const step = params.get('step') || 'home';
    const saved = localStorage.getItem('stem_session');
    
    if (saved) session = JSON.parse(saved);
    
    if (step === 'exam' && session.year && session.mode) {
        startExam(session.year);
    } else if (step === 'history') {
        showResultsHistory();
    } else if (routes[step] !== undefined) {
        navigateTo(step, false);
        if (step === 'year' && session.subject && session.type) {
            renderYearButtons();
        }
    } else {
        navigateTo('home', false);
    }
};
