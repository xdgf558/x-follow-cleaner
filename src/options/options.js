import { getSettings, saveSettings } from "../shared/storage.js";

const elements = {
  form: document.querySelector("#settingsForm"),
  inactiveThresholdDays: document.querySelector("#inactiveThresholdDays"),
  hideWhitelisted: document.querySelector("#hideWhitelisted"),
  showUnknown: document.querySelector("#showUnknown"),
  defaultSort: document.querySelector("#defaultSort"),
  languageHint: document.querySelector("#languageHint"),
  enableConservativeMode: document.querySelector("#enableConservativeMode"),
  conservativeScanCooldownSeconds: document.querySelector("#conservativeScanCooldownSeconds"),
  saveStatus: document.querySelector("#saveStatus")
};

function setStatus(message) {
  elements.saveStatus.textContent = message;
}

async function loadSettings() {
  const settings = await getSettings();

  elements.inactiveThresholdDays.value = String(settings.inactiveThresholdDays);
  elements.hideWhitelisted.checked = Boolean(settings.hideWhitelisted);
  elements.showUnknown.checked = Boolean(settings.showUnknown);
  elements.defaultSort.value = settings.defaultSort || "inactiveDaysDesc";
  elements.languageHint.value = settings.languageHint || "en";
  elements.enableConservativeMode.checked = Boolean(settings.enableConservativeMode);
  elements.conservativeScanCooldownSeconds.value = String(settings.conservativeScanCooldownSeconds || 30);
}

async function handleSubmit(event) {
  event.preventDefault();

  const settings = {
    inactiveThresholdDays: Number(elements.inactiveThresholdDays.value),
    hideWhitelisted: elements.hideWhitelisted.checked,
    showUnknown: elements.showUnknown.checked,
    defaultSort: elements.defaultSort.value,
    languageHint: elements.languageHint.value,
    enableConservativeMode: elements.enableConservativeMode.checked,
    conservativeScanCooldownSeconds: Number(elements.conservativeScanCooldownSeconds.value),
    enableExperimentalBatchCheck: false
  };

  await saveSettings(settings);
  setStatus("设置已保存。");
}

elements.form.addEventListener("submit", (event) => {
  handleSubmit(event).catch((error) => {
    setStatus(`保存失败：${error.message}`);
  });
});

loadSettings().catch((error) => {
  setStatus(`设置加载失败：${error.message}`);
});
