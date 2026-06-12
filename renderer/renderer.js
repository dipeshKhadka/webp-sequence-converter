const selectFolderBtn = document.getElementById("selectFolderBtn");
const selectOutputBtn = document.getElementById("selectOutputBtn");
const convertBtn = document.getElementById("convertBtn");
const sourcePathEl = document.getElementById("sourcePath");
const outputPathEl = document.getElementById("outputPath");
const fileSummary = document.getElementById("fileSummary");
const logOutput = document.getElementById("logOutput");
const widthInput = document.getElementById("width");
const heightInput = document.getElementById("height");
const fpsInput = document.getElementById("fps");
const qualityInput = document.getElementById("quality");
const effortInput = document.getElementById("effort");
const losslessInput = document.getElementById("lossless");
const loopInput = document.getElementById("loop");

let selectedFiles = [];
let outputPath = "";

function updateUiState() {
  const isReady = selectedFiles.length > 0 && outputPath;
  convertBtn.disabled = !isReady;
}

function appendLog(message) {
  logOutput.textContent += `\n${message}`;
  logOutput.scrollTop = logOutput.scrollHeight;
}

selectFolderBtn.addEventListener("click", async () => {
  const result = await window.api.selectImageFolder();
  if (result.canceled) {
    return;
  }
  selectedFiles = result.files;
  sourcePathEl.textContent = result.folderPath;
  fileSummary.innerHTML = "";
  fileSummary.appendChild(
    createSummaryP(`Images found: ${selectedFiles.length}`),
  );
  if (selectedFiles.length > 0) {
    const sample = selectedFiles
      .slice(0, 4)
      .map((file) => file.split(/[/\\]/).pop())
      .join(", ");
    fileSummary.appendChild(
      createSummaryP(`Sample: ${sample}${selectedFiles.length > 4 ? "…" : ""}`),
    );
  }
  updateUiState();
});

selectOutputBtn.addEventListener("click", async () => {
  const result = await window.api.selectOutputFile();
  if (result.canceled) {
    return;
  }
  outputPath = result.outputPath;
  outputPathEl.textContent = outputPath;
  updateUiState();
});

convertBtn.addEventListener("click", async () => {
  const width = parseInt(widthInput.value, 10) || 0;
  const height = parseInt(heightInput.value, 10) || 0;
  const fps = parseInt(fpsInput.value, 10) || 24;
  const quality = parseInt(qualityInput.value, 10) || 80;
  const effort = parseInt(effortInput.value, 10);
  const lossless = losslessInput.value === "true";
  const loop = parseInt(loopInput.value, 10);

  logOutput.textContent = "Starting export...";
  appendLog(`Source images: ${selectedFiles.length}`);
  appendLog(`Output file: ${outputPath}`);
  appendLog(
    `Width: ${width || "original"}; Height: ${height || "original"}; FPS: ${fps}`,
  );
  appendLog(
    `Quality: ${quality}; Effort: ${effort}; Lossless: ${lossless}; Loop: ${loop}`,
  );

  convertBtn.disabled = true;
  try {
    await window.api.convertSequence({
      files: selectedFiles,
      outputPath,
      width: width || 0,
      height: height || 0,
      fps,
      quality,
      effort,
      lossless,
      loop,
    });
    appendLog("Export completed successfully.");
  } catch (error) {
    appendLog(`Error: ${error.message}`);
  } finally {
    convertBtn.disabled = false;
  }
});

window.api.onProgress((message) => {
  appendLog(message.trim());
});

const minBtn = document.getElementById("minBtn");
const maxBtn = document.getElementById("maxBtn");
const closeBtn = document.getElementById("closeBtn");

if (minBtn && maxBtn && closeBtn) {
  minBtn.addEventListener("click", () => window.api.minimizeWindow());
  maxBtn.addEventListener("click", () => window.api.toggleMaximize());
  closeBtn.addEventListener("click", () => window.api.closeWindow());

  window.api.onWindowState((state) => {
    maxBtn.textContent = state === "maximized" ? "❐" : "☐";
  });
}

function createSummaryP(text) {
  const chip = document.createElement("span");
  chip.textContent = text;
  return chip;
}
