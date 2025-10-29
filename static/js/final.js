// static/js/script.js
document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // --- Small helpers ---
  const $ = (id) => document.getElementById(id);
  const statusEl = $("opStatus");

  async function postJSON(url, bodyObj) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyObj ? JSON.stringify(bodyObj) : null,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false) {
      throw new Error(data.error || `Request failed: ${resp.status}`);
    }
    return data;
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  // --- Elements ---
  const quizRange = $("quizRange");
  const rangeValue = $("rangeValue");
  const browseBtn = $("browseBtn");
  const fileInput = $("fileInput");
  const fileStatus = $("fileStatus");
  const filePreview = $("filePreview");
  const generateBtn = $("generateBtn");
  const questionInp = $("questionInput");
  const askBtn = $("askBtn");
  const exportDiv = $("export-options");
  const quizBox = $("quizBox");
  const quizList = $("quizList");
  const quizStatus = $("quizStatus");
  const quizResults = $("quizResults");
  const submitQuizBtn = $("submitQuizBtn");

  // Sidebar / mobile controls
  const fileList = $("fileList");
  const questionWarning = $("questionWarning");
  const quizWarning = $("quizWarning");
  const toggleBtn = $("toggleBtn");
  const sidebar = $("sidebar");
  const mobileToggle = $("mobileToggle");

  // ==============================
  // 1️⃣ Range slider update
  // ==============================
  function updateRangeValue() {
    const value = parseInt(quizRange.value);
    const min = parseInt(quizRange.min);
    const max = parseInt(quizRange.max);
    const percent = (value - min) / (max - min);

    rangeValue.textContent = value;
    quizRange.style.setProperty("--range-progress", `${percent * 100}%`);

    const trackWidth = quizRange.offsetWidth;
    const leftPosition = percent * trackWidth;
    rangeValue.style.left = `${leftPosition}px`;
  }

  quizRange?.addEventListener("input", updateRangeValue);
  window.addEventListener("load", () => {
    updateRangeValue();
    setTimeout(updateRangeValue, 10);
  });

  // ==============================
  // 2️⃣ File handling + preview + list
  // ==============================
  let uploadedFiles = [];

  if (browseBtn && fileInput) {
    browseBtn.addEventListener("click", () => fileInput.click());
  }

  fileInput?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    uploadedFiles.push(...files);
    renderFileList();

    const file = files[0];
    if (fileStatus) fileStatus.textContent = file ? `Selected: ${file.name}` : "";

    if (filePreview && file && (file.type === "text/plain" || /\.txt$/i.test(file.name))) {
      const reader = new FileReader();
      reader.onload = (ev) => (filePreview.textContent = String(ev.target?.result || ""));
      reader.readAsText(file);
    } else if (filePreview) {
      filePreview.textContent = file ? "📄 File selected. Preview only available for .txt files." : "";
    }
  });

  function renderFileList() {
    if (!fileList) return;
    fileList.innerHTML = "";
    uploadedFiles.forEach((file, index) => {
      const li = document.createElement("li");
      li.classList.add("uploaded-file-item");
      li.dataset.index = index;

      const nameSpan = document.createElement("span");
      nameSpan.textContent = file.name;
      nameSpan.classList.add("file-name");

      const deleteBtn = document.createElement("button");
      deleteBtn.classList.add("delete-file-btn");
      deleteBtn.innerHTML = '<i class="fa fa-times"></i>';

      li.appendChild(nameSpan);
      li.appendChild(deleteBtn);
      fileList.appendChild(li);
    });
    attachDeleteListeners();
  }

  function deleteFile(index) {
    uploadedFiles.splice(index, 1);
    renderFileList();
    fileInput.value = "";
  }

  function attachDeleteListeners() {
    document.querySelectorAll(".delete-file-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const li = e.target.closest("li");
        if (li) deleteFile(parseInt(li.dataset.index));
      });
    });
  }

  // ==============================
  // 3️⃣ Ask question handler
  // ==============================

  // ---- 3) Ask a question (server) ----
  function ensureAnswerBox() {
    let box = $("answerBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "answerBox";
      box.className = "mt-3";
      box.innerHTML = `
        <div class="border rounded p-3 bg-light" id="answerText" style="white-space: pre-wrap;"></div>
      `;
      questionInp?.parentNode?.insertBefore(box, questionInp.nextSibling);
    }
    return box;
  }

  async function askQuestion() {
    const q = (questionInp?.value || "").trim();
    if (!q) { questionInp?.focus(); return; }
    if (askBtn) askBtn.disabled = true;
    setStatus("Answering...");
    try {
      const data = await postJSON("/ask", { question: q });
      ensureAnswerBox();
      const answerText = $("answerText");
      if (answerText) answerText.textContent = data.answer || "(no answer)";
      setStatus("✅ Answer ready.");
    } catch (err) {
      setStatus(`⚠️ ${err.message}`);
    } finally {
      if (askBtn) askBtn.disabled = false;
    }
  }

  if (askBtn) askBtn.addEventListener("click", askQuestion);
  if (questionInp) {
    questionInp.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        // Enter alone → add newline (do nothing, allow default)
        // Optional: you can just return
        return;
      } else if (ev.key === "Enter" && ev.shiftKey) {
        // Shift+Enter → submit
        ev.preventDefault();
        askQuestion();
      }
    });
  }


  // ---- 4) Generate Quiz (server) + render + export ----
  let lastQuiz = [];

  function renderQuiz(quiz) {
    if (!quizList) return;
    quizList.innerHTML = '';
    quiz.forEach((q, idx) => {
      const correct = (q.correct || '').trim().replace(/[^A-D]/ig, '').toUpperCase(); // "A"–"D"
      const item = document.createElement('div');
      item.className = 'list-group-item';
      item.dataset.correct = correct;

      const choicesHtml = ['A','B','C','D'].map((L, i) => {
        const raw = (q.choices?.[i] || '').trim();
        const labelText = raw.replace(/^[A-D]\)\s*/i, '');
        const id = `q${idx}-${L}`;
        return `
          <div class="form-check ms-2">
            <input class="form-check-input" type="radio" name="q${idx}" id="${id}" value="${L}">
            <label class="form-check-label" for="${id}">
              <span class="badge bg-light text-dark me-2">${L}.</span> ${labelText || raw}
            </label>
          </div>
        `;
      }).join('');

        item.innerHTML = `
          <div class="fw-semibold mb-1">${q.question || ('Question ' + (idx + 1))}</div>
          ${choicesHtml}
          <div class="mt-2" id="feedback-${idx}"></div> <!-- feedback placeholder -->
          ${q.explanation ? `<button class="btn btn-link btn-sm mt-1" type="button" onclick="showExplanation(${idx})">Explanation</button>
          <div class="alert alert-secondary mt-1" id="explanation-${idx}" style="display:none;">${q.explanation}</div>` : ''}
        `;

      quizList.appendChild(item);
    });

    if (quizResults) quizResults.innerHTML = '';   // clear prior summary
    if (quizStatus)  quizStatus.textContent = '';  // clear status line
    if (quizBox)     quizBox.style.display = 'block';
  }

  function gradeQuiz() {
    if (!quizList) return;
    const items = [...quizList.querySelectorAll('.list-group-item')];
    const total = items.length;

    const answers = items.map((item, idx) => {
      const selected = item.querySelector('input[type="radio"]:checked');
      return {
        idx,
        selected: selected ? selected.value.toUpperCase() : null,
        correct:  (item.dataset.correct || '').toUpperCase()
      };
    });

    // Require all answered
    const unanswered = answers.filter(a => !a.selected).map(a => a.idx + 1);
    if (unanswered.length) {
      if (quizStatus)  quizStatus.textContent = `Please answer all questions before submitting. Missing: ${unanswered.join(', ')}.`;
      if (quizResults) quizResults.innerHTML = '';
      return; // ⛔ do not reveal anything yet
    }

let correctCount = 0;

    answers.forEach(a => {
      const item = items[a.idx];
      const feedbackDiv = item.querySelector(`#feedback-${a.idx}`);
      const options = [...item.querySelectorAll('input[type="radio"]')];

      options.forEach(opt => {
        const label = item.querySelector(`label[for="${opt.id}"]`);
        label.classList.remove('text-success','text-danger');

        // Highlight correct answer green
        if (opt.value.toUpperCase() === a.correct) {
          label.classList.add('text-success', 'fw-bold');
        }

        // Highlight user's wrong choice red
        if (opt.checked && opt.value.toUpperCase() !== a.correct) {
          label.classList.add('text-danger', 'fw-bold');
        }
      });

      const ok = a.selected === a.correct;
      if (ok) correctCount++;

      if (feedbackDiv) {
        feedbackDiv.innerHTML = ok 
          ? `<span class="text-success fw-bold answer-correct d-inline-block">✅  Correct!</span>` 
          : `<span class="text-danger fw-bold answer-wrong d-inline-block">❌  Wrong. Correct answer: ${a.correct}</span>`;
      }
    });


    // Calculate score
    const pct = Math.round((correctCount / total) * 100);

    // Show overall score
    if (quizResults) {
      quizResults.innerHTML = `
        <div style="
          border: 1px solid;
          padding: 10px;
          border-radius: 5px;
          margin: 10px 0 0 0;
          font-size: 14px;
          font-weight: 700;
        ">
          Your Score: <strong>${correctCount}/${total}</strong> (${pct}%)
        </div>
      `;
    }
    if (quizStatus) quizStatus.textContent = '✅ Graded.';

/** 

    const pct = Math.round((correctCount / total) * 100);
    if (quizResults) {
      quizResults.innerHTML = `
        <div class="alert alert-info mb-2">
          Score: <strong>${correctCount}/${total}</strong> (${pct}%)
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead><tr><th>#</th><th>Your Answer</th><th>Correct</th><th>Result</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      `;
      quizResults.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (quizStatus) quizStatus.textContent = '✅ Graded.';
    */

  }

  // Attach once
  if (submitQuizBtn) submitQuizBtn.addEventListener('click', gradeQuiz);

  function attachExportButtons() {
    if (!exportDiv) return;
    exportDiv.innerHTML = `
      <h6 class="mt-4">📤 Export Options</h6>
      <button id="exportCsvBtn" class="btn btn-outline-secondary me-2 mybutton">Export CSV</button>
      <button id="exportPdfBtn" class="btn btn-outline-secondary mybutton">Export PDF</button>
    `;
    const exportCsvBtn = $("exportCsvBtn");
    const exportPdfBtn = $("exportPdfBtn");

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener("click", () => {
        if (!lastQuiz.length || !window.Papa) return;
        const rows = lastQuiz.map((q) => ({
          question: q.question,
          choiceA: q.choices?.[0] || "",
          choiceB: q.choices?.[1] || "",
          choiceC: q.choices?.[2] || "",
          choiceD: q.choices?.[3] || "",
          correct: q.correct || "",
        }));
        const csv = Papa.unparse(rows);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "quiz.csv";
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    if (exportPdfBtn) {
      exportPdfBtn.addEventListener("click", () => {
        if (!lastQuiz.length || !window.jspdf) return;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let y = 10;
        doc.setFontSize(12);

        lastQuiz.forEach((q, i) => {
          const qLines = doc.splitTextToSize(`${i + 1}. ${q.question}`, 180);
          doc.text(qLines, 10, y); y += qLines.length * 6 + 2;
          (q.choices || []).forEach((c) => {
            const cl = doc.splitTextToSize(`- ${c}`, 175);
            doc.text(cl, 14, y); y += cl.length * 6 + 1;
          });
          doc.text(`Answer: ${q.correct}`, 10, y); y += 10;
          if (y > 270) { doc.addPage(); y = 10; }
        });

        doc.save("quiz.pdf");
      });
    }
  }

  if (generateBtn && quizRange) {
    generateBtn.addEventListener("click", async () => {
      const num = parseInt(quizRange.value || "5", 10);
      generateBtn.disabled = true;
      if (quizStatus) quizStatus.textContent = `Generating ${num} questions...`;
      try {
        const data = await postJSON("/generate_quiz", { num_questions: num });
        lastQuiz = data.quiz || [];
        renderQuiz(lastQuiz);
        attachExportButtons();
        if (quizStatus) quizStatus.textContent = '✅ Quiz ready.';
      } catch (err) {
        if (quizStatus) quizStatus.textContent = `⚠️ ${err.message}`;
      } finally {
        generateBtn.disabled = false;
      }
    });
  }
});

  // ==============================
  // 5️⃣ Sidebar toggles
  // ==============================
  toggleBtn?.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    const icon = toggleBtn.querySelector("i");
    icon.classList.toggle("fa-angle-double-right");
    icon.classList.toggle("fa-angle-double-left");
  });

  mobileToggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    const icon = mobileToggle.querySelector("i");
    const isOpening = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", isOpening);
    if (isOpening) {
      icon.classList.remove("fa-bars");
      icon.classList.add("fa-times");
    } else {
      icon.classList.remove("fa-times");
      icon.classList.add("fa-bars");
    }

});



