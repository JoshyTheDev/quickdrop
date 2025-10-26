const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const toast = document.getElementById("toast");
const progressContainer = document.getElementById("progressContainer");
const progressBar = document.getElementById("progressBar");
const themeToggle = document.getElementById("themeToggle");

const uploadModal = document.getElementById("uploadModal");
const modalContent = document.getElementById("uploadModalContent");
const modalLink = document.getElementById("modalLink");
const modalPreview = document.getElementById("modalPreview");
const modalClose = modalContent.querySelector(".closeModal");
const modalCopyBtn = document.getElementById("modalCopyBtn");

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const ALLOWED_TYPES = [
  "image/png", "image/jpeg", "image/jpg", "image/gif",
  "video/mp4", "video/webm", "video/quicktime"
];

// === Theme auto-detect ===
let savedTheme = localStorage.getItem("theme");
if (!savedTheme) {
  savedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
document.body.classList.toggle("light", savedTheme === "light");
themeToggle.textContent = savedTheme === "light" ? "☀️" : "🌙";

themeToggle.addEventListener("click", () => {
  const isLight = document.body.classList.toggle("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  themeToggle.textContent = isLight ? "☀️" : "🌙";
});

// === Drag & drop ===
dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  uploadFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", (e) => uploadFile(e.target.files[0]));

// === Toast messages ===
function showToast(msg, type = "info", duration = 2500) {
  toast.textContent = msg;
  toast.style.display = "block";

  switch (type) {
    case "success": toast.style.background = "#4caf50"; break;
    case "error": toast.style.background = "#f44336"; break;
    case "warn": toast.style.background = "#ff9800"; break;
    default: toast.style.background = "#333";
  }

  toast.style.opacity = "1";
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => (toast.style.display = "none"), 300);
  }, duration);
}

// === Compress images client-side ===
async function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => (img.src = e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(maxWidth / img.width, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(new File([blob], file.name, { type: file.type })),
        "image/jpeg",
        quality
      );
    };
    img.onerror = reject;
  });
}

// === Upload file ===
async function uploadFile(file) {
  if (!file) return;

  // File type check
  if (!ALLOWED_TYPES.includes(file.type)) {
    showToast("❌ File type not allowed!", "error");
    return;
  }

  // Compress images
  if (file.type.startsWith("image/")) file = await compressImage(file);

  // File size check
  if (file.size > MAX_FILE_SIZE) {
    showToast("❌ File too large!", "error");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  progressContainer.style.display = "block";
  progressBar.style.width = "0%";

  try {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/upload");

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = (e.loaded / e.total) * 100;
        progressBar.style.width = percent + "%";
      }
    });

    xhr.onload = () => {
      progressContainer.style.display = "none";
      if (xhr.status < 200 || xhr.status >= 300) {
        showToast("❌ Upload failed", "error");
        return;
      }

      const data = JSON.parse(xhr.responseText);
      const url = data.url;

      // Show modal
      modalLink.textContent = url;
      modalLink.href = url;
      modalPreview.innerHTML = "";

      const ext = file.name.split(".").pop().toLowerCase();
      if (["png","jpg","jpeg","gif"].includes(ext)) {
        const img = document.createElement("img");
        img.src = url;
        modalPreview.appendChild(img);
      } else if (["mp4","webm","mov"].includes(ext)) {
        const video = document.createElement("video");
        video.src = url;
        video.controls = true;
        modalPreview.appendChild(video);
      }

      uploadModal.style.display = "flex";

      // Copy button
      modalCopyBtn.onclick = () => {
        navigator.clipboard.writeText(url).then(() => showToast("✅ Link copied!", "success"));
      };

      // Auto-copy
      navigator.clipboard.writeText(url).then(() => showToast("✅ Link copied!", "success"));
    };

    xhr.onerror = () => {
      progressContainer.style.display = "none";
      showToast("❌ Network error. Upload failed.", "error");
    };

    xhr.send(formData);
  } catch {
    progressContainer.style.display = "none";
    showToast("❌ Upload failed.", "error");
  }
}

// Close modal
modalClose.addEventListener("click", () => {
  uploadModal.style.display = "none";
});
window.addEventListener("click", (e) => {
  if (e.target === uploadModal) uploadModal.style.display = "none";
});
