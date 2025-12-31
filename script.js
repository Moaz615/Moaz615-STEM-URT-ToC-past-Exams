let session = { subject: "", type: "", year: "" };
let currentExamData = null;

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
    'exam': 4,
    'results': 5,
    'history': 6
};

function navigateTo(stepName, pushState = true) {
    const stepNumber = routes[stepName];
    document.querySelectorAll(".step-section").forEach(s => s.classList.remove("active"));
    document.getElementById(`step-${stepNumber}`).classList.add("active");

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
    const nextStep = key === "subject" ? 'type' : 'year';
    if (nextStep === 'year') {
        renderYearButtons();
    }
    navigateTo(nextStep);
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
        
        const onClickHandler = isAvailable ? `onclick="startExam('${year}')"` : '';
        const disabledAttr = isAvailable ? '' : 'disabled';
        
        html += `<button class="${buttonClass}" ${onClickHandler} ${disabledAttr}>${year} ${availabilityText}${badgeHtml}</button>`;
    });
    
    container.innerHTML = html;
}

async function startExam(year) {
    const isAvailable = await checkExamAvailability(year);
    if (!isAvailable) {
        alert(`The exam for ${year} is not available. Please select an available exam.`);
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
        renderExam();
        navigateTo('exam');
    } catch (err) {
        console.error('Failed to load exam data:', err);
        alert("Exam data could not be loaded! Check console for details.");
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

    let html = "";
    if (currentExamData.passage) {
        html += `<div class="passage-box"><strong>Passage:</strong><br>${currentExamData.passage}</div>`;
    }

    currentExamData.questions.forEach((q, i) => {
        html += `
        <div class="question-card">
            <p class="question-text"><strong>Q${i + 1}:</strong> ${q.q}</p>
            ${getImagesHtml(q, false)}
            <div class="options-container">
                ${q.options.map((opt, idx) => `
                    <label class="option-label">
                        <input type="radio" name="q${i}" value="${idx}"> ${opt}
                    </label>`).join("")}
            </div>
        </div>`;
    });

    document.getElementById("exam-container").innerHTML = html;
    if (window.MathJax) MathJax.typesetPromise();
}

function saveExamResult(subject, type, year, score, total) {
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
        score,
        total,
        percentage,
        bestScore,
        bestPercentage,
        attempts,
        timestamp,
        lastAttempt: timestamp
    };
    
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
    let score = 0;
    let reviewHtml = "";
    
    currentExamData.questions.forEach((q, i) => {
        const selected = document.querySelector(`input[name="q${i}"]:checked`);
        const userIndex = selected ? Number(selected.value) : null;
        const isCorrect = userIndex === q.correct;
        if (isCorrect) score++;
        
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

    const total = currentExamData.questions.length;
    const result = saveExamResult(session.subject, session.type, session.year, score, total);

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
    localStorage.removeItem('stem_session');
    window.location.href = window.location.pathname;
}

function showResultsHistory() {
    const allResults = getAllExamResults();
    const container = document.getElementById('history-container');
    
    if (!container) return;
    
    const resultsArray = Object.values(allResults);
    
    if (resultsArray.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No completed exams yet. Start practicing to see your results here!</p>';
        navigateTo('history');
        return;
    }
    
    resultsArray.sort((a, b) => new Date(b.lastAttempt) - new Date(a.lastAttempt));
    
    let html = '<div class="history-grid">';
    resultsArray.forEach(result => {
        const date = new Date(result.lastAttempt).toLocaleDateString();
        const time = new Date(result.lastAttempt).toLocaleTimeString();
        html += `
            <div class="history-card">
                <div class="history-header">
                    <h3>${result.subject.toUpperCase()} ${result.type.toUpperCase()} - ${result.year}</h3>
                    <span class="history-date">${date} ${time}</span>
                </div>
                <div class="history-stats">
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
                    ${result.score !== result.bestScore ? `
                    <div class="stat-item">
                        <span class="stat-label">Last Score:</span>
                        <span class="stat-value">${result.score} / ${result.total}</span>
                    </div>
                    ` : ''}
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
    
    const params = new URLSearchParams(window.location.search);
    const step = params.get('step') || 'home';
    const saved = localStorage.getItem('stem_session');
    
    if (saved) session = JSON.parse(saved);
    
    if (step === 'exam' && session.year) {
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