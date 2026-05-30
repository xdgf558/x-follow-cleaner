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
  enableExperimentalBatchCheck: document.querySelector("#enableExperimentalBatchCheck"),
  experimentalBatchSize: document.querySelector("#experimentalBatchSize"),
  experimentalDelayPreset: document.querySelector("#experimentalDelayPreset"),
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
  elements.enableExperimentalBatchCheck.checked = Boolean(settings.enableExperimentalBatchCheck);
  elements.experimentalBatchSize.value = String(settings.experimentalBatchSize || 20);
  elements.experimentalDelayPreset.value = `${settings.experimentalMinDelaySeconds || 15}-${settings.experimentalMaxDelaySeconds || 30}`;
}

async function handleSubmit(event) {
  event.preventDefault();

  const settings = {
    ...await getSettings(),
    inactiveThresholdDays: Number(elements.inactiveThresholdDays.value),
    hideWhitelisted: elements.hideWhitelisted.checked,
    showUnknown: elements.showUnknown.checked,
    defaultSort: elements.defaultSort.value,
    languageHint: elements.languageHint.value,
    enableConservativeMode: elements.enableConservativeMode.checked,
    conservativeScanCooldownSeconds: Number(elements.conservativeScanCooldownSeconds.value),
    enableExperimentalBatchCheck: elements.enableExperimentalBatchCheck.checked,
    experimentalBatchSize: Number(elements.experimentalBatchSize.value),
    experimentalMinDelaySeconds: Number(elements.experimentalDelayPreset.value.split("-")[0]),
    experimentalMaxDelaySeconds: Number(elements.experimentalDelayPreset.value.split("-")[1])
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
