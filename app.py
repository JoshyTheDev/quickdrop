from flask import Flask, render_template, request, send_from_directory, abort, jsonify
import os, uuid, time, logging
from PIL import Image
import threading

app = Flask(__name__, static_folder="src")

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Rate limiting: 1 upload per 10 seconds per IP
UPLOAD_LIMIT = 1
TIME_WINDOW = 10
user_uploads = {}  # {ip: [timestamps]}

# Allowed MIME types
ALLOWED_MIME_TYPES = [
    "image/png", "image/jpeg", "image/gif",
    "video/mp4", "video/webm", "video/quicktime"
]

# Max file size (bytes)
MAX_FILE_SIZE = 200 * 1024 * 1024  # 200 MB

# File expiration
EXPIRATION_SECONDS = 24 * 3600  # 24 hours

# Logging
logging.basicConfig(filename="uploads.log", level=logging.INFO)

def log_upload(ip, filename, success=True):
    logging.info(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - {ip} - {filename} - {'SUCCESS' if success else 'FAIL'}")

# Cleanup expired files
def cleanup_uploads():
    while True:
        now = time.time()
        for root, dirs, files in os.walk(UPLOAD_FOLDER):
            for f in files:
                file_path = os.path.join(root, f)
                if now - os.path.getmtime(file_path) > EXPIRATION_SECONDS:
                    try:
                        os.remove(file_path)
                        logging.info(f"Deleted expired file: {file_path}")
                    except Exception as e:
                        logging.warning(f"Failed to delete {file_path}: {e}")
        time.sleep(3600)  # Run cleanup every hour

# Start cleanup thread
threading.Thread(target=cleanup_uploads, daemon=True).start()

# CSP header
@app.after_request
def add_security_headers(resp):
    resp.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "img-src 'self' data: https:; "
        "script-src 'self';"
    )
    return resp

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/upload", methods=["POST"])
def upload():
    ip = request.remote_addr
    now = time.time()

    if ip not in user_uploads:
        user_uploads[ip] = []

    # Clean old timestamps
    user_uploads[ip] = [t for t in user_uploads[ip] if now - t < TIME_WINDOW]

    # Rate limit check
    if len(user_uploads[ip]) >= UPLOAD_LIMIT:
        retry_after = TIME_WINDOW - (now - user_uploads[ip][0])
        return jsonify({
            "error": "Rate limit exceeded. Try again later.",
            "retry_after": round(retry_after)
        }), 429

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    # Check file size
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > MAX_FILE_SIZE:
        log_upload(ip, file.filename, success=False)
        return jsonify({"error": "File too large"}), 400

    # Randomized subfolder
    subfolder = uuid.uuid4().hex[:2]
    folder_path = os.path.join(UPLOAD_FOLDER, subfolder)
    os.makedirs(folder_path, exist_ok=True)

    # Save file with secure UUID filename
    ext = file.filename.split('.')[-1]
    unique_filename = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(folder_path, unique_filename)
    file.save(file_path)

    # Compress images if applicable
    if ext.lower() in ["png", "jpg", "jpeg", "gif"]:
        try:
            img = Image.open(file_path)
            max_width = 800
            if img.width > max_width:
                ratio = max_width / img.width
                img = img.resize((max_width, int(img.height * ratio)))
            img.save(file_path, optimize=True, quality=70)
        except Exception as e:
            logging.warning(f"Image compression failed for {file_path}: {e}")

    # Log upload timestamp and file
    user_uploads[ip].append(now)
    log_upload(ip, file.filename)

    file_url = request.host_url + f"file/{subfolder}/{unique_filename}"
    return jsonify({"url": file_url})

@app.route("/file/<subfolder>/<filename>")
def serve_file(subfolder, filename):
    file_path = os.path.join(UPLOAD_FOLDER, subfolder, filename)
    if os.path.exists(file_path):
        return send_from_directory(os.path.join(UPLOAD_FOLDER, subfolder), filename)
    else:
        abort(404)

if __name__ == "__main__":
    app.run(debug=True)
