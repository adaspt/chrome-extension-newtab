const DEFAULT_FOLDER = "NewTab";

const input = document.getElementById("folder");
const status = document.getElementById("status");

chrome.storage.sync.get({ folderName: DEFAULT_FOLDER }).then(({ folderName }) => {
  input.value = folderName;
});

document.getElementById("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const folderName = input.value.trim() || DEFAULT_FOLDER;
  input.value = folderName;
  await chrome.storage.sync.set({ folderName });
  status.textContent = "Saved.";
});
