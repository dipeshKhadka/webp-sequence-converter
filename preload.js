const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  selectImageFolder: () => ipcRenderer.invoke("select-image-folder"),
  selectOutputFile: () => ipcRenderer.invoke("select-output-file"),
  convertSequence: (config) => ipcRenderer.invoke("convert-sequence", config),
  minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window-toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window-close"),
  onProgress: (fn) =>
    ipcRenderer.on("conversion-progress", (_event, message) => fn(message)),
  onWindowState: (fn) =>
    ipcRenderer.on("window-state", (_event, state) => fn(state)),
});
