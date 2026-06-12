const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");

// Resolve ffmpeg path with fallbacks for packaged app
let ffmpegPath;
try {
  // First try standard require (development)
  ffmpegPath = require("ffmpeg-static");
} catch (e) {
  // Fallback for packaged app - ffmpeg-static might be in resources
  const possiblePaths = [
    path.join(app.getAppPath(), "node_modules/ffmpeg-static/bin/ffmpeg.exe"),
    path.join(app.getAppPath(), "../node_modules/ffmpeg-static/bin/ffmpeg.exe"),
    path.join(
      process.resourcesPath,
      "node_modules/ffmpeg-static/bin/ffmpeg.exe",
    ),
  ];

  ffmpegPath = possiblePaths.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  if (!ffmpegPath) {
    console.error(
      "FFmpeg binary not found at any known location",
      possiblePaths,
    );
  }
}

app.disableHardwareAcceleration();
app.setAppUserModelId("com.example.imageSequenceToWebP");
app.setPath("userData", path.join(app.getPath("appData"), "WebPSequence"));

function createWindow() {
  const win = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 820,
    minHeight: 620,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  win.on("maximize", () => win.webContents.send("window-state", "maximized"));
  win.on("unmaximize", () => win.webContents.send("window-state", "restored"));
}

function getImageFiles(folderPath) {
  const ext = [".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp"];
  const files = fs
    .readdirSync(folderPath)
    .filter((name) => ext.includes(path.extname(name).toLowerCase()));

  // Sort with natural numeric ordering
  const sorted = files.sort((a, b) => {
    // Extract all numbers from filenames
    const numsA = a.match(/\d+/g) || [];
    const numsB = b.match(/\d+/g) || [];

    // If both have numbers, compare numerically from first number
    if (numsA.length > 0 && numsB.length > 0) {
      for (let i = 0; i < Math.min(numsA.length, numsB.length); i++) {
        const cmp = parseInt(numsA[i]) - parseInt(numsB[i]);
        if (cmp !== 0) return cmp;
      }
    }

    // Otherwise, use locale comparison
    return a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  return sorted.map((name) => path.join(folderPath, name));
}

ipcMain.handle("select-image-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  const folderPath = result.filePaths[0];
  const files = getImageFiles(folderPath);
  return { canceled: false, folderPath, files };
});

ipcMain.handle("select-output-file", async () => {
  const result = await dialog.showSaveDialog({
    title: "Save animated WebP",
    defaultPath: "animation.webp",
    filters: [{ name: "WebP", extensions: ["webp"] }],
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  return { canceled: false, outputPath: result.filePath };
});

ipcMain.handle("window-minimize", () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

ipcMain.handle("window-toggle-maximize", () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.handle("window-close", () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});

ipcMain.handle("convert-sequence", async (event, config) => {
  const {
    files,
    outputPath,
    width,
    height,
    fps,
    quality,
    effort,
    lossless,
    loop,
  } = config;
  if (!files || files.length === 0) {
    throw new Error("No image files were selected.");
  }
  if (!outputPath) {
    throw new Error("No output path specified.");
  }

  // Filter out the output file from input files (normalize paths for comparison)
  const normalizedOutputPath = path.resolve(outputPath).toLowerCase();
  const filteredFiles = files.filter(
    (f) => path.resolve(f).toLowerCase() !== normalizedOutputPath,
  );

  if (filteredFiles.length === 0) {
    throw new Error(
      "No valid image files found after filtering out the output file.",
    );
  }

  // Send progress update about file count
  event.sender.send(
    "conversion-progress",
    `Processing ${filteredFiles.length} image(s)...`,
  );
  event.sender.send(
    "conversion-progress",
    `Files in order:\n${filteredFiles.map((f, i) => `  ${i + 1}. ${path.basename(f)}`).join("\n")}\n`,
  );

  const listPath = path.join(
    os.tmpdir(),
    `image-sequence-to-webp-${Date.now()}.txt`,
  );

  // Calculate frame duration based on FPS
  const frameFps = fps && fps > 0 ? fps : 24;
  const frameDuration = 1 / frameFps;

  // Build concat file with durations for each frame
  const text = filteredFiles
    .map(
      (filePath) => `file '${filePath.replace(/'/g, "'\\''")}'
duration ${frameDuration}`,
    )
    .join("\n");
  fs.writeFileSync(listPath, text, "utf8");

  const args = ["-y", "-f", "concat", "-safe", "0", "-i", listPath];

  const filters = [];
  if (width || height) {
    const widthValue = width && width > 0 ? width : -1;
    const heightValue = height && height > 0 ? height : -1;
    filters.push(`scale=${widthValue}:${heightValue}:flags=lanczos`);
  }
  if (fps && fps > 0) {
    filters.push(`fps=${fps}`);
  }
  if (filters.length > 0) {
    args.push("-vf", filters.join(","));
  }

  args.push(
    "-c:v",
    "libwebp",
    "-quality",
    String(quality ?? 75),
    "-compression_level",
    String(effort ?? 4),
    "-preset",
    "picture",
    "-lossless",
    lossless ? "1" : "0",
    outputPath,
  );

  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      return reject(
        new Error("FFmpeg binary not found. Please reinstall the application."),
      );
    }

    const ffmpeg = spawn(ffmpegPath, args, { windowsHide: true });

    ffmpeg.stderr.on("data", (chunk) => {
      const message = chunk.toString();
      event.sender.send("conversion-progress", message);
    });

    ffmpeg.on("error", (error) => {
      reject(new Error(`FFmpeg execute failed: ${error.message}`));
    });

    ffmpeg.on("close", (code) => {
      fs.unlink(listPath, () => {});
      if (code === 0) {
        resolve({ success: true });
      } else {
        reject(new Error(`FFmpeg exited with code ${code}.`));
      }
    });
  });
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
