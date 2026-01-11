// static/js/final.js
document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  document.querySelectorAll(".flash").forEach((flash) => {
    setTimeout(() => {
      flash.style.opacity = "0";
      setTimeout(() => flash.remove(), 400); // match CSS transition
    }, 6000);
  });

  // --- Small helpers ---
  const $ = (id) => document.getElementById(id);
  const statusEl = $("opStatus");
  console.log("final.js loaded ✅");
  console.log("delete button found:", !!document.getElementById("deleteDocBtn"));

  function showAlert(message, type = "success", timeout = 4000) {
    const container = document.getElementById("alertContainer");
    if (!container) return;

    container.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;

    if (timeout) {
      setTimeout(() => {
        const alert = container.querySelector(".alert");
        alert?.classList.remove("show");
        alert?.classList.add("fade");
        setTimeout(() => alert?.remove(), 300);
      }, timeout);
    }
  }

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
  /*
  // Smoothly animate the progress bar width (helps fast uploads not "jump")
  function smoothTo(targetPct, bar, label, phaseText) {
    if (!bar) return;

    const current = parseFloat(bar.style.width) || 0;
    const start = performance.now();
    const duration = 350; // ms

    function step(t) {
      const p = Math.min(1, (t - start) / duration);
      const val = current + (targetPct - current) * p;

      bar.style.width = val.toFixed(1) + "%";
      if (label) label.textContent = `${phaseText}… ${Math.round(val)}%`;

      if (p < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function animateUploadTo40(bar, label) {
    if (!bar) return;

    const start = performance.now();
    const duration = 450; // ms
    const from = parseFloat(bar.style.width) || 0; // <-- current!
    const to = 40;

    function step(t) {
      const p = Math.min(1, (t - start) / duration);
      const v = from + (to - from) * p;

      bar.style.width = v.toFixed(1) + "%";
      if (label) label.textContent = `Uploading… ${Math.round(v)}%`;

      if (p < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  } */



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
    if (!quizRange || !rangeValue) return;

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
  //let uploadedFiles = [];

  const uploadBox = document.getElementById("uploadBox");
  const selectedFileName = document.getElementById("selectedFileName");

  // === Browse button click ===
  browseBtn?.addEventListener("click", () => {
    fileInput?.click();
  });

  // === File input change handler ===
  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0] || null;

    // Update selected file name
    if (selectedFileName) {
      selectedFileName.textContent = file ? `Selected file: ${file.name}` : "";
    }

    // Optional: update status
    if (fileStatus) {
      fileStatus.textContent = file ? `Selected: ${file.name}` : "";
    }
  });

  // === Drag & drop handling ===
  if (uploadBox && fileInput) {
    // Prevent default behavior for drag events
    ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
      uploadBox.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    // Add hover style when dragging files over
    ["dragenter", "dragover"].forEach(eventName => {
      uploadBox.addEventListener(eventName, () => uploadBox.classList.add("dragover"));
    });

    // Remove hover style when leaving or dropping
    ["dragleave", "drop"].forEach(eventName => {
      uploadBox.addEventListener(eventName, () => uploadBox.classList.remove("dragover"));
    });

    // Handle dropped files
    uploadBox.addEventListener("drop", (e) => {
      const files = e.dataTransfer?.files;
      if (!files || !files.length) return;

      // Set dropped file to input
      const dt = new DataTransfer();
      dt.items.add(files[0]);
      fileInput.files = dt.files;

      // Update UI
      if (selectedFileName) selectedFileName.textContent = `Selected file: ${files[0].name}`;

      // Trigger change event for the same handling as browse button
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
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

    const filename = getSelectedDocName();
    if (!filename) {
      alert("Please select a document from 'Uploaded files' first.");
      return;
    }

    if (askBtn) askBtn.disabled = true;
    setStatus("Answering...");
    try {
      const data = await postJSON("/ask", { question: q, filename });
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
        ev.preventDefault();
        askQuestion();
        return;
      } //else if (ev.key === "Enter" && ev.shiftKey) {
      // Shift+Enter → submit

      //}
    });
  }


  //################################################################
  //handler for delete document
  //################################################################
  const deleteDocBtn = document.getElementById("deleteDocBtn");
  deleteDocBtn?.addEventListener("click", async () => {
    const filename = getSelectedDocName();

    if (!filename) {
      showModal("Please select a document to delete.");
      return;
    }

    const confirmed = await showConfirmModal(
      `Delete "${filename}" and its database?`
    );

    if (!confirmed) return;


    try {
      const resp = await fetch("/delete_doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
      });
      const data = await resp.json();
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || "Delete failed");
      }

      // ✅ Green success alert
      showAlert(data.message || "Document deleted successfully.", "success");

      // Refresh after short delay so user sees alert
      setTimeout(() => location.reload(), 1200);

    } catch (e) {
      showAlert(e.message, "danger");
    }
  });

  function showConfirmModal(message) {
    return new Promise((resolve) => {
      const modal = $("customModal");
      const modalMsg = $("customModalMsg");
      const modalBtn = $("customModalBtn");      // OK / Confirm
      const modalClose = $("customModalClose");  // X / Cancel

      if (!modal || !modalMsg || !modalBtn || !modalClose) {
        resolve(false);
        return;
      }

      modalMsg.textContent = message;
      modal.classList.add("show");

      function cleanup() {
        modal.classList.remove("show");
        modalBtn.removeEventListener("click", onConfirm);
        modalClose.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onOutside);
        window.removeEventListener("keydown", onEsc);
      }

      function onConfirm() {
        cleanup();
        resolve(true);
      }

      function onCancel() {
        cleanup();
        resolve(false);
      }

      function onOutside(e) {
        if (e.target === modal) onCancel();
      }

      function onEsc(e) {
        if (e.key === "Escape") onCancel();
      }

      modalBtn.addEventListener("click", onConfirm);
      modalClose.addEventListener("click", onCancel);
      modal.addEventListener("click", onOutside);
      window.addEventListener("keydown", onEsc);
    });
  }


  function showModal(message) {
    const modal = $("customModal");
    const modalMsg = $("customModalMsg");
    const modalBtn = $("customModalBtn");
    const modalClose = $("customModalClose");
    if (!modal || !modalMsg || !modalBtn || !modalClose) return;

    modalMsg.textContent = message;
    modal.classList.add("show");

    function closeModal() {
      modal.classList.remove("show");
      modalBtn.removeEventListener("click", closeModal);
      modalClose.removeEventListener("click", closeModal);
      modal.removeEventListener("click", outsideClick);
      window.removeEventListener("keydown", escClose);
    }

    function escClose(e) {
      if (e.key === "Escape") closeModal();
    }

    function outsideClick(e) {
      if (e.target === modal) closeModal();
    }

    modalBtn.addEventListener("click", closeModal);
    modalClose.addEventListener("click", closeModal);
    window.addEventListener("keydown", escClose);
    modal.addEventListener("click", outsideClick);
  }



  // ------------------------------------
  // Handle upload with real progress (0–40%)
  // ------------------------------------
  let __clientUploadPct = 0;        // 0..40 from xhr.upload
  let __clientUploading = false;    // true while XHR upload is in progress

  const uploadForm = document.getElementById("uploadForm");
  if (uploadForm) {
    uploadForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      // Abort any previous upload XHR
      window.__currentUploadXhr?.abort();
      window.__currentUploadXhr = null;

      // Stop any previous poller before starting a new upload
      if (window.__progressPoller) {
        clearInterval(window.__progressPoller);
        window.__progressPoller = null;
      }

      const fileInput = document.getElementById("fileInput");
      const file = fileInput?.files?.[0];
      //if (!file) { alert("Please choose a file first!"); return; }

      if (!file) {
        showModal("Please choose a file first!");
        return;
      }
      //Disable submit button during upload
      uploadForm
        .querySelector("button[type=submit]")
        ?.setAttribute("disabled", "true");


      // 1) Create job_id before uploading
      const j = await fetch("/init_upload", { method: "POST" }).then(r => r.json());
      if (!j.ok) { showModal("Could not start job"); return; }
      const jobId = j.job_id;

      // 2) Show progress bar UI
      const wrap = document.getElementById("buildProgress");
      const bar = document.getElementById("buildBar");
      const label = document.getElementById("buildLabel");

      if (wrap) wrap.style.display = "block";
      if (bar) {
        bar.classList.remove("bg-danger");
        bar.classList.add("processing");
        bar.style.width = "0%";
      }
      if (label) label.textContent = "Uploading… 0%";

      // ✅ 3) Start polling RIGHT NOW (server-side upload progress)
      startProgressPoller(jobId);

      // 4) Upload via XHR (WITH client-side progress)
      const formData = new FormData();
      formData.append("file", file);

      __clientUploadPct = 0;
      __clientUploading = true;

      const xhr = new XMLHttpRequest();
      window.__currentUploadXhr = xhr;


      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;

        const frac = e.loaded / e.total;                 // 0..1
        const pct = Math.max(1, Math.floor(frac * 40));  // 1..40
        __clientUploadPct = pct;

        // IMPORTANT: update UI directly here for buttery smooth upload
        if (bar) bar.style.width = pct + "%";
        if (label) label.textContent = `Uploading… ${pct}%`;
      };

      xhr.addEventListener("load", () => {
        // Upload finished (server processing will take over 40->100)
        __clientUploading = false;

        // If upload completed too fast, force bar to 40 immediately
        if (bar && __clientUploadPct < 40) bar.style.width = "40%";
        if (label && __clientUploadPct < 40) label.textContent = "Uploading… 40%";
      });

      xhr.addEventListener("error", () => {
        __clientUploading = false;
        // 🔓 Re-enable submit button
        uploadForm
          ?.querySelector("button[type=submit]")
          ?.removeAttribute("disabled");

        if (label) label.textContent = "Upload error!";
        if (bar) bar.classList.add("bg-danger");
      });

      xhr.open("POST", uploadForm.action, true);
      xhr.setRequestHeader("X-Job-Id", jobId);
      xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
      xhr.send(formData);

    });
  }

  // ==============================
  // Poller handles progress updates
  // ==============================
  function startProgressPoller(jobId) {
    const buildProgress = document.getElementById("buildProgress");
    const buildBar = document.getElementById("buildBar");
    const buildLabel = document.getElementById("buildLabel");
    if (!jobId || !buildProgress || !buildBar || !buildLabel || window.__progressPoller) return;

    buildProgress.style.display = "block";
    buildBar.classList.remove("bg-danger");

    const stop = () => {
      clearInterval(window.__progressPoller);
      window.__progressPoller = null;
    };

    window.__progressPoller = setInterval(async () => {
      try {
        const resp = await fetch(`/progress/${jobId}`, { cache: "no-store" });
        if (!resp.ok) {
          stop();
          buildLabel.textContent = "Progress unavailable.";
          buildBar.classList.add("bg-danger");
          // 🔓 Re-enable submit button
          uploadForm?.querySelector('button[type="submit"]')?.removeAttribute("disabled");
          return;
        }

        const data = await resp.json();
        const phase = (data.phase || "").toLowerCase();
        const pct = Math.max(0, Math.min(100, Number(data.pct || 0)));

        // ✅ While client upload is active, ignore server "Uploading" updates < 40
        if (__clientUploading && phase === "uploading" && pct < 40) return;

        buildBar.style.width = pct + "%";
        buildLabel.textContent = `${data.phase || "Working"}… ${pct}%`;

        if (phase === "processing" || phase === "summarizing" || phase === "queued") {
          buildBar.classList.add("processing");
        } else {
          buildBar.classList.remove("processing");
        }

        if (phase === "completed") {
          stop();
          buildBar.classList.remove("processing");
          buildLabel.textContent = "Completed 100%";

          // ✅ Show uploaded files container
          const uploadedContainer = document.getElementById("uploadedFilesContainer");
          if (uploadedContainer) uploadedContainer.style.display = "block";

          // 🔓 Re-enable submit button
          uploadForm?.querySelector('button[type="submit"]')?.removeAttribute("disabled");

          setTimeout(() => location.reload(), 400);
          return;
        }

        if (phase === "error") {
          stop();
          buildBar.classList.remove("processing");
          buildLabel.textContent = `Error: ${data.error || "Unknown error"}`;
          buildBar.classList.add("bg-danger");

          // 🔓 Re-enable submit button
          uploadForm?.querySelector('button[type="submit"]')?.removeAttribute("disabled");
          return;
        }
      } catch (e) {
        stop();
        buildLabel.textContent = "Could not fetch progress.";
        buildBar.classList.add("bg-danger");
        // 🔓 Re-enable submit button
        uploadForm?.querySelector('button[type="submit"]')?.removeAttribute("disabled");
      }
    }, 500);

    window.addEventListener("beforeunload", stop, { once: true });
  }


  // Auto-start when page already has a job id (e.g., /generate)
  const initialJobId = document.body?.dataset?.jobId || "";
  const wrap = document.getElementById("buildProgress");
  if (initialJobId && wrap && getComputedStyle(wrap).display !== "none" && !window.__progressPoller) {
    startProgressPoller(initialJobId);
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

      const choicesHtml = ['A', 'B', 'C', 'D'].map((L, i) => {
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
    if (quizStatus) quizStatus.textContent = '';  // clear status line
    if (quizBox) quizBox.style.display = 'block';
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
        correct: (item.dataset.correct || '').toUpperCase()
      };
    });

    // NEW: grab warning div
    const quizWarning = document.getElementById('quizWarning');
    // Require all answered
    const unanswered = answers.filter(a => !a.selected).map(a => a.idx + 1);
    if (unanswered.length) {
      if (quizWarning) quizWarning.textContent = "⛔Please answer all Questions before submitting";
      if (quizResults) quizResults.innerHTML = '';
      if (quizStatus) quizStatus.textContent = "";
      return; // ⛔ do not reveal anything yet
    }

    // if we get here, everything is answered → clear warning
    if (quizWarning) quizWarning.textContent = "";

    let correctCount = 0;

    answers.forEach(a => {
      const item = items[a.idx];
      const feedbackDiv = item.querySelector(`#feedback-${a.idx}`);
      const options = [...item.querySelectorAll('input[type="radio"]')];

      options.forEach(opt => {
        const label = item.querySelector(`label[for="${opt.id}"]`);
        label.classList.remove('text-success', 'text-danger');

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
    // Save result to server
    const filename = getSelectedDocName();
    if (filename) {
      fetch("/save_result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: filename,
          correct: correctCount,
          total: total,
          percent: pct
        })
      }).catch(() => {
        // fail silently – quiz UI still works
      });
    }


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

      // Show the "View Scores" button
      const viewBtn = document.getElementById("viewScoresBtn");
      if (viewBtn) {
        viewBtn.classList.remove("result-hidden");
      }
    }
    if (quizStatus) quizStatus.textContent = '✅ Graded.';


  }

  // Attach once
  if (submitQuizBtn) submitQuizBtn.addEventListener('click', gradeQuiz);

  function attachExportButtons() {
    if (!exportDiv) return;
    exportDiv.innerHTML = `
      <h6 class="mt-2">📤 Export Options</h6>
      <button id="exportCsvBtn" class="btn btn-primary mybutton">Export CSV</button>
      <button id="exportPdfBtn" class="bbtn btn-primary mybutton">Export PDF</button>
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

  function clearPreviousQuiz() {
    lastQuiz = [];

    if (quizList) quizList.innerHTML = "";
    if (quizResults) quizResults.innerHTML = "";
    if (quizStatus) quizStatus.textContent = "";
    if (quizWarning) quizWarning.textContent = "";
    if (exportDiv) exportDiv.innerHTML = "";
    if (quizBox) quizBox.style.display = "none";
  }

  if (generateBtn && quizRange) {
    generateBtn.addEventListener("click", async () => {
      const num = parseInt(quizRange.value || "5", 10);

      const filename = getSelectedDocName();


      if (!filename) {
        showModal("Please select a document from 'Uploaded files' first.");
        return;
      }

      // CLEAR OLD QUIZ BEFORE GENERATING A NEW ONE
      clearPreviousQuiz();

      generateBtn.disabled = true;
      if (quizStatus) quizStatus.textContent = `Generating ${num} questions...`;
      try {
        const data = await postJSON("/generate_quiz", { num_questions: num, filename, });
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
  // =======================================
  // 5️⃣a. Helper to get selected document
  // ======================================
  function getSelectedDocName() {
    const selected = document.querySelector(".doc-select:checked");
    return selected ? selected.value : null;
  }

  // Only allow one document checked at a time
  document.addEventListener("change", (e) => {
    if (e.target.classList && e.target.classList.contains("doc-select")) {
      if (e.target.checked) {
        // Ensure only one is checked
        document.querySelectorAll(".doc-select").forEach((cb) => {
          if (cb !== e.target) cb.checked = false;
        });

        // Clear previous answer
        const answerBox = document.getElementById("answerBox");
        const answerText = document.getElementById("answerText");
        const questionInput = document.getElementById("questionInput");
        if (answerText) answerText.textContent = "";
        if (answerBox) answerBox.remove();
        if (questionInput) questionInput.value = "";

        // Clear previous quiz
        const quizBox = document.getElementById("quizBox");
        const quizList = document.getElementById("quizList");
        const quizResults = document.getElementById("quizResults");
        const quizStatus = document.getElementById("quizStatus");
        const quizWarning = document.getElementById("quizWarning");
        const exportDiv = document.getElementById("export-options");

        if (quizList) quizList.innerHTML = "";
        if (quizResults) quizResults.innerHTML = "";
        if (quizStatus) quizStatus.textContent = "";
        if (quizWarning) quizWarning.textContent = "";
        if (quizBox) quizBox.style.display = "none";
        if (exportDiv) exportDiv.innerHTML = "";

        // When user selects a doc, load its summary
        const filename = e.target.value;
        loadSummaryFor(filename);
      } else {
        // If user unchecks, you could also hide the summary if you want
        // const sumSec = document.getElementById("summarySection");
        // const sumTxt = document.getElementById("summaryText");
        // if (sumSec && sumTxt) { sumTxt.textContent = ""; sumSec.style.display = "none"; }
      }
    }
  });


  if (fileList) {
    const checkboxes = fileList.querySelectorAll(".doc-select");
    if (checkboxes.length === 1) {
      checkboxes[0].checked = true;
      // Trigger change event to run existing logic (load summary, clear old quiz, etc.)
      const event = new Event("change", { bubbles: true });
      checkboxes[0].dispatchEvent(event);
    }
  }


  async function loadSummaryFor(filename) {
    const sumSec = document.getElementById("summarySection");
    const sumTxt = document.getElementById("summaryText");
    if (!sumSec || !sumTxt) return;
    sumTxt.textContent = "Loading summary…";
    sumSec.style.display = "block";

    try {
      const resp = await fetch(`/summary?filename=${encodeURIComponent(filename)}`, {
        cache: "no-store",
      });
      const data = await resp.json();

      // Apply same formatting as server: **bold** + newlines
      let html = (data.summary || "(No summary stored yet for this document.)")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");
      sumTxt.innerHTML = html;
    } catch (e) {
      sumTxt.textContent = "Could not load summary.";
    }
  }

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


  // Select all feedback trigger links
  const feedbackLinks = document.querySelectorAll(".feedback-open");
  const feedbackModal = document.getElementById("feedback-modal");
  const feedbackClose = document.getElementById("feedback-close");
  const feedbackForm = document.getElementById("feedbackForm");
  const mainContent = document.getElementById("main"); // if modal is inside main

  // Close modal function
  function closeModal() {
    feedbackModal.classList.remove("active");
    if (mainContent) {
      mainContent.style.overflow = "";
    } else {
      document.body.style.overflow = "";
    }
  }

  // Open modal on any trigger click
  feedbackLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      feedbackModal.classList.add("active");
      // Lock scrolling inside main (or body if modal covers entire page)
      if (mainContent) {
        mainContent.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "hidden";
      }
    });
  });

  // Close modal on cancel button click
  feedbackClose.addEventListener("click", () => {
    feedbackModal.classList.remove("active");
    if (mainContent) {
      mainContent.style.overflow = "";
    } else {
      document.body.style.overflow = "";
    }
  });

  // Close modal when clicking outside the modal content
  feedbackModal.addEventListener("click", (e) => {
    if (e.target === feedbackModal) {
      feedbackModal.classList.remove("active");
      if (mainContent) {
        mainContent.style.overflow = "";
      } else {
        document.body.style.overflow = "";
      }
    }
  });

  // Close modal on pressing ESC key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      feedbackModal.classList.remove("active");
      if (mainContent) {
        mainContent.style.overflow = "";
      } else {
        document.body.style.overflow = "";
      }
    }
  });

  feedbackForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(feedbackForm);

    try {
      const response = await fetch("/send-feedback", {
        method: "POST",
        body: formData
      });

      const result = await response.json();

      // Use flash messages instead of alert
      const flashContainer = document.querySelector(".flash-container");
      if (flashContainer) {
        const flash = document.createElement("div");
        flash.className = `flash flash-${result.status}`;
        flash.innerHTML = `
        <span class="flash-message">${result.message}</span>
        <button class="flash-close" onclick="this.parentElement.remove()" aria-label="Dismiss">×</button>
      `;
        flashContainer.appendChild(flash);
        setTimeout(() => flash.remove(), 5000);
      }

      if (result.status === "success") {
        feedbackForm.reset();
        closeModal();
      }

    } catch (err) {
      console.error("Feedback submission failed:", err);
      // Flash error
      const flashContainer = document.querySelector(".flash-container");
      if (flashContainer) {
        const flash = document.createElement("div");
        flash.className = "flash flash-error";
        flash.innerHTML = `
        <span class="flash-message">Failed to send feedback. Please try again later.</span>
        <button class="flash-close" onclick="this.parentElement.remove()" aria-label="Dismiss">×</button>
      `;
        flashContainer.appendChild(flash);
        setTimeout(() => flash.remove(), 5000);
      }
    }
  });

}); 