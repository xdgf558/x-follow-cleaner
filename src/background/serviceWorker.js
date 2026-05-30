import { getSettings, getTaskState, saveSettings, saveTaskState } from "../shared/storage.js";

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await saveSettings(settings);

  const taskState = await getTaskState();
  if (!taskState.lastUpdatedAt) {
    await saveTaskState({
      currentStage: "idle",
      lastAction: "installed",
      message: "插件已安装，等待用户手动操作。"
    });
  }
});
