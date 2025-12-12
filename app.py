# app.py
import os, os.path
import re
import uuid
from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
from werkzeug.utils import secure_filename
from pypdf import PdfReader
import docx
import shutil
import stat
import math
from tempfile import SpooledTemporaryFile
import time
import logging
from threading import Thread
#from time import sleep
from werkzeug.wrappers import Request as WerkzeugRequest
from tempfile import SpooledTemporaryFile
from flask.wrappers import Request as FlaskRequest
PROGRESS = {} 

# LangChain / OpenAI
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import CharacterTextSplitter
from openai import OpenAI
from dotenv import load_dotenv


# load environment variables from .env for the OpenAI code
#load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# ---------- Flask setup ----------
BASEDIR = os.path.dirname(__file__)
load_dotenv(os.path.join(BASEDIR, ".env"))  # load .env before creating the app

app = Flask(__name__)

# ✅ REQUIRED for sessions/flash — try FLASK_SECRET_KEY, then SECRET_KEY, then a dev fallback
app.config["SECRET_KEY"] = (
    os.getenv("FLASK_SECRET_KEY")
    or os.getenv("SECRET_KEY")
    or "dev-change-me"
)


app.config["UPLOAD_FOLDER"] = os.path.join(BASEDIR, "uploads")
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

# Allowed extensions (unchanged)
ALLOWED_EXTENSIONS = {"pdf", "docx", "txt"}


# ---------- Helpers ----------
def allowed_file(filename: str) -> bool:
    """Check extension against the allowed set."""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from PDF pages (no OCR)."""
    try:
        with open(file_path, "rb") as f:
            reader = PdfReader(f)
            return "".join([(page.extract_text() or "") for page in reader.pages])
    except Exception as e:
        return f"Error extracting text from PDF: {e}"


def extract_text_from_docx(file_path: str) -> str:
    """Extract text from DOCX paragraphs."""
    try:
        d = docx.Document(file_path)
        return "\n".join([p.text for p in d.paragraphs if p.text.strip()])
    except Exception as e:
        return f"Error extracting text from DOCX: {e}"


def process_uploaded_file(file_storage):
    """
    Save the uploaded file securely and extract its text content.
    Returns (text, base_name_without_ext, sanitized_filename).
    """
    filename = secure_filename(file_storage.filename)
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file_storage.save(save_path)

    lower = filename.lower()
    if lower.endswith(".pdf"):
        text = extract_text_from_pdf(save_path)
    elif lower.endswith(".docx"):
        text = extract_text_from_docx(save_path)
    elif lower.endswith(".txt"):
        with open(save_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
    else:
        text = "Unsupported file type."

    base_name_without_ext = os.path.splitext(filename)[0]
    return text, base_name_without_ext, filename


def get_openai_client():
    """Create an OpenAI client using the API key in the environment."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set in environment.")
    return OpenAI(api_key=api_key)


def get_document_prompt(docs):
    """Format a list of strings or LangChain Documents into a numbered prompt block."""
    out = []
    for i, d in enumerate(docs, 1):
        text = d if isinstance(d, str) else getattr(d, "page_content", "")
        out.append(f"\nContent {i}:\n{text}\n")
    return "\n".join(out)



def _on_rm_error(func, path, exc_info):
    """Windows-safe remover: make file writable then retry."""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        logging.warning("Could not remove: %s", path)


def _process_job(job_id: str, text: str, persist_dir: str, filename: str, start_pct: int = 40, end_pct: int = 100):
    """
    Run the embedding + summary build and report progress scaled into [start_pct, end_pct].
    """
    def scale(local):  # local is 0..100 → map into [start..end]
        local = max(0, min(100, int(local)))
        span = max(1, end_pct - start_pct)
        return start_pct + int(round(local * span / 100.0))

    try:
        PROGRESS[job_id] = {"phase": "Processing", "pct": scale(2)}
        os.makedirs(persist_dir, exist_ok=True)

        # Split text
        PROGRESS[job_id] = {"phase": "Processing", "pct": scale(5)}
        text_splitter = CharacterTextSplitter(separator=" ", chunk_size=5000, chunk_overlap=100)
        docs = text_splitter.split_text(text) if text else []

        # Build embeddings + DB
        PROGRESS[job_id] = {"phase": "Processing", "pct": scale(10)}
        client = get_openai_client()
        embeddings = OpenAIEmbeddings(model="text-embedding-3-large", openai_api_key=client.api_key)
        vectordb = Chroma(embedding_function=embeddings, persist_directory=persist_dir)

        total = max(len(docs), 1)
        batch = 50
        added = 0
        for i in range(0, len(docs), batch):
            chunk = docs[i:i + batch]
            vectordb.add_texts(chunk)
            added += len(chunk)
            local_pct = 10 + (65 * added / total)  # 10→75 locally
            PROGRESS[job_id] = {"phase": f"Processing", "pct": scale(local_pct)}

        # Summarize
        PROGRESS[job_id] = {"phase": "Summarizing", "pct": scale(90)}
        raw = vectordb.get(include=["documents"])
        sample = (raw.get("documents") or [])[:15]
        prompt = get_document_prompt(sample) if sample else "No content available."

        system_message = (
            f"Generate a summary of the following notebook content::\n\n"
            f"\n\n###\n{prompt}\n###\n\n"
            "The summary should contain the title of the book and a short sentence about the notebook"
            "The first line must be the notebook title, wrapped in double asterisks, like:\n"
            "Title: at the beginning of the notebook title"
            "Then add two newline characters (\\n\\n).\n"
            "After that, write the rest of the summary"
            "The summary should never be move that 8 sentences"
            "Be precise, avoid opinions, and summarize the main points in a clear and structured way. "
            "If the document has multiple sections, break it into meaningful segments."
        )
        resp = get_openai_client().chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": system_message}],
            temperature=0.2,
        )
        summary_text = resp.choices[0].message.content

        PROGRESS[job_id] = {"phase": "completed", "pct": scale(100), "summary": summary_text, "filename": filename, }

    except Exception as e:
        PROGRESS[job_id] = {"phase": "error", "pct": end_pct, "error": str(e)}

class _ProgressReportingFile:
    """
    Wraps a writable file object and bumps PROGRESS[job_id] on every write().
    Progress is quantized to 5% steps from 0..40 for the upload phase.
    """
    def __init__(self, base_file, job_id, total_len):
        self._f = base_file
        self._job_id = job_id
        self._total = max(1, int(total_len or 0))
        self._seen = 0
        # Start from whatever PROGRESS says (usually 0)
        self._last_step = int(PROGRESS.get(job_id, {}).get("pct", 0))
        self._last_emit = 0.0  # throttle updates a bit

    def write(self, b):
        n = self._f.write(b)
        self._seen += n

        # Map bytes received 0..total → 0..40
        pct_raw = (self._seen / self._total) * 40.0
        # Snap to 5% steps: 0,5,10,...,40
        step = int(min(40, 5 * math.floor(pct_raw / 5.0)))

        now = time.monotonic()
        if step > self._last_step and (now - self._last_emit) >= 0.09:  # ~10 updates/sec max
            self._last_step = step
            self._last_emit = now
            PROGRESS[self._job_id] = {"phase": "Uploading", "pct": step}

        return n

    # Delegate other attributes/methods to the underlying file (seek, close, etc.)
    def __getattr__(self, name):
        return getattr(self._f, name)


class StreamingRequest(FlaskRequest):
    """Use Flask's Request so Flask internals (e.g., .blueprints) exist."""
    def stream_factory(self, total_content_length, content_type, filename, content_length=None):
        # Destination file the parser writes to
        base = SpooledTemporaryFile(max_size=10 * 1024 * 1024, mode="wb+", buffering=0)

        # Job id provided by your XHR header
        job_id = self.headers.get("X-Job-Id", "")
        if job_id:
            total_len = total_content_length or content_length or 0
            return _ProgressReportingFile(base, job_id, total_len)
        return base

# Tell Flask to use it
app.request_class = StreamingRequest


# ---------- Routes ----------
@app.get("/")
def index():
    #landing page for uploading document
    return render_template("index.html")


# Home = just go to index (no clearing)
@app.get("/home")
def home():
    return redirect(url_for("index"))


# Reset = clear session + delete last vector DB, then go home
@app.post("/reset")
def reset():
    persist_dir = session.get("persist_directory")
    if persist_dir and os.path.isdir(persist_dir):
        try:
            shutil.rmtree(persist_dir, onerror=_on_rm_error)
        except Exception as e:
            app.logger.warning("Failed to remove persist dir %s: %s", persist_dir, e)
    session.clear()
    flash("Reset completed. Upload a new file to start.", "success")
    return redirect(url_for("generate"))


@app.get("/generate")
def generate():
    job_id = session.get("job_id")
    if job_id:
        st = PROGRESS.get(job_id, {})
        phase = (st.get("phase") or "").lower()
        if phase == "completed" and st.get("summary"):
            docs = session.get("docs", {})
            filename = st.get("filename" or session.get("uploaded_filename"))
            # Save summary per document
            if filename:
                info = docs.get(filename, {})
                info["persist_dir"] = info.get("persist_dir") or session.get("persist_directory")
                info["summary"] = st["summary"]
                docs[filename] = info
                session["docs"] = docs
                # Also keep "current" summary for the page
                session["uploaded_filename"] = filename
                session["summary_text"] = st["summary"]
            PROGRESS.pop(job_id, None)
            session.pop("job_id", None)
            job_id = None  # <- ensures the template won’t emit data-job-id
        elif phase == "error":
            flash(f"⚠️ Could not build index or generate summary: {st.get('error')}", "error")
            PROGRESS.pop(job_id, None)
            session.pop("job_id", None)
            job_id = None

    return render_template("generate.html",
        filename=session.get("uploaded_filename"),
        summary=session.get("summary_text"),
        job_id=job_id,  # will be None if finished
    )


#This is for clicking a checkbox and instantly seeing that file’s summary.
@app.get("/summary")
def get_summary():
    filename = request.args.get("filename", "")
    docs = session.get("docs", {})
    info = docs.get(filename) or {}
    summary = info.get("summary")
    return jsonify({"ok": True, "summary": summary or ""})


#Used to syle the summary
@app.template_filter("markdown_bold")
def markdown_bold(s):
    if not isinstance(s, str):
        return s
    return re.sub(r"\*\*(.*?)\*\*", r"<strong>\1</strong>", s)


@app.template_filter("nl2br")
def nl2br(s):
    if not isinstance(s, str):
        return s
    # turn newlines into <br> for HTML
    return s.replace("\n", "<br>")


#Create a job_id before uploading so the UI can start polling#
@app.post("/init_upload")
def init_upload():
    job_id = uuid.uuid4().hex
    PROGRESS[job_id] = {"phase": "Uploading", "pct": 0}
    session["job_id"] = job_id  # so /generate can render it
    return jsonify({"ok": True, "job_id": job_id})


@app.post("/progress_update")
def progress_update():
    data = request.get_json(silent=True) or {}
    job_id = data.get("job_id")
    raw = max(0, min(100, int(data.get("pct", 0))))
    if not job_id or job_id not in PROGRESS:
        return jsonify({"ok": False, "error": "Unknown job_id"}), 400

    mapped = int(round(raw * 0.40))  # 0..40
    PROGRESS[job_id]["phase"] = "Uploading"
    PROGRESS[job_id]["pct"] = mapped
    return ("", 204)

@app.post("/upload")
def upload():
    # Expect the pre-created job_id
    job_id = session.get("job_id")
    if not job_id:
        # fallback: create one if someone posted directly
        job_id = uuid.uuid4().hex
        PROGRESS[job_id] = {"phase": "Uploading", "pct": 0}
        session["job_id"] = job_id

    if "file" not in request.files:
        flash("No file part in request.", "error")
        return redirect(url_for("generate"))

    f = request.files["file"]
    if f.filename == "":
        flash("No file selected.", "error")
        return redirect(url_for("generate"))

    if not allowed_file(f.filename):
        flash("Unsupported file type. Please upload PDF, DOCX, or TXT.", "error")
        return redirect(url_for("generate"))

    # Save + extract
    text, base, filename = process_uploaded_file(f)

    # Track uploaded list for sidebar
    uploaded = session.get("uploaded_files", [])
    uploaded.append(filename)
    session["uploaded_files"] = uploaded

    # Init session state for this upload
    persist_dir = os.path.abspath(f"./chroma_db_{base}_{uuid.uuid4().hex[:8]}")

    #per-document map in the session
    docs = session.get("docs", {})
    docs[filename] = {
        "persist_dir": persist_dir,
        # summary will be filled after _process_job completes
    }
    session["docs"] = docs
    session["persist_directory"] = persist_dir
    session["uploaded_filename"] = filename
    session["summary_text"] = None
    session["summary_generated"] = False

    #start background processing for this file
    PROGRESS[job_id] = {"phase": "queued", "pct": 40, "filename": filename}
    t = Thread(target=_process_job, args=(job_id, text, persist_dir, filename, 40, 100), daemon=True)
    t.start()

    app.logger.info("X-Job-Id seen by /upload: %s", request.headers.get("X-Job-Id"))

    # Keep identifiers for the generate page
    #session["job_id"] = job_id
    #session["uploaded_filename"] = filename

    # Go to the generate page so the JS can poll /progress/<job_id>
    return redirect(url_for("generate"))


@app.get("/progress/<job_id>")
def get_progress(job_id):
    st = PROGRESS.get(job_id, {"phase": "queued", "pct": 0})
    app.logger.debug("PROGRESS[%s] -> %s", job_id, st)
    return jsonify(st)


@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json(silent=True) or {}
    question = data.get("question", "").strip()
    filename = data.get("filename")
    if not question:
        return jsonify({"ok": False, "error": "Question is required."}), 400
    
    # Look up persist_dir by filename
    docs = session.get("docs", {})
    info = docs.get(filename or "", {})

    persist_dir = info.get("persist_dir") if info else None
    if not persist_dir or not os.path.isdir(persist_dir):
        return jsonify({"ok": False, "error": "Please select a Notebook before asking a Question."}), 400

    client = get_openai_client()
    embeddings = OpenAIEmbeddings(model="text-embedding-3-large", openai_api_key=client.api_key)
    vectordb = Chroma(embedding_function=embeddings, persist_directory=persist_dir)

    # Retrieve relevant docs
    retrieved = vectordb.similarity_search(question, k=10)
    context = get_document_prompt(retrieved)

    system_message = (
        f"You are a professor teaching a course. Use the following notebook content "
        f"to answer student questions accurately and concisely:\n\n{context}\n\n"
        "Be precise and avoid opinions."
        "Only state what is in the notebook content"
        "Do not state what is not in the given notebook and be very precise and straight forward "
    )

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_message},
            {"role": "user", "content": question},
        ],
        temperature=0.1,
    )
    answer = resp.choices[0].message.content
    return jsonify({"ok": True, "answer": answer})


#Generate multiple-choice questions from the vector DB.
@app.route("/generate_quiz", methods=["POST"])
def generate_quiz():
    data = request.get_json(silent=True) or {}
    num = int(data.get("num_questions", 5))
    filename = data.get("filename")

    # Look up persist_dir by filename
    docs = session.get("docs", {})
    info = docs.get(filename or "", {})
    persist_dir = info.get("persist_dir") if info else None
    if not persist_dir or not os.path.isdir(persist_dir):
        return jsonify({"ok": False, "error": "Please select a Notebook before generating Quiz."}), 400

    client = get_openai_client()
    embeddings = OpenAIEmbeddings(model="text-embedding-3-large", openai_api_key=client.api_key)
    vectordb = Chroma(embedding_function=embeddings, persist_directory=persist_dir)

    raw = vectordb.get(include=["documents"])
    all_docs = raw.get("documents", [])
    sample = all_docs[:20] if all_docs else []
    context = get_document_prompt(sample) if sample else "No content available."

    system_message = (
        f"Generate {num} multiple-choice quiz questions from the following notebook content: "
        f"\n\n###\n{context}\n###\n\n"
        f"Each question should have 4 answer choices (A,B,C,D) and indicate the correct answer at the end:"
        f"""the format of the reply should be
        Question 1: <question>
        A)  <answer choice A>
        B)  <answer choice B>
        C)  <answer choice C>
        D)  <answer choice D>
        Correct Answer: C

        Question 2: <question>
         ..."""
         )
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": system_message}],
        temperature=0.2,
    )
    text = resp.choices[0].message.content.strip()

    # Parse very simply
    blocks = [b for b in text.split("\n\n") if b.strip()]
    quiz = []
    for b in blocks:
        lines = b.splitlines()
        if len(lines) >= 6 and lines[0].lower().startswith("question"):
            q = lines[0].strip()
            choices = lines[1:5]
            correct = lines[5].split(":")[-1].strip()
            quiz.append({"question": q, "choices": choices, "correct": correct})

    return jsonify({"ok": True, "quiz": quiz})

@app.route("/results")
def results():
    return render_template("results.html")

#if __name__ == "__main__":
#    app.run(debug=True)

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

