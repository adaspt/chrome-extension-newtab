# Bookmark New Tab

A Chrome new tab page that shows your shortcuts grouped by folder. The shortcuts are ordinary Chrome bookmarks, so Chrome Sync carries them to every PC.

## Bookmark layout

```
Bookmarks bar/
└── NewTab/                ← the folder this page shows (name set in Settings)
    ├── GitHub             ← loose bookmarks: an untitled first group
    ├── Work/              ← each subfolder is a group
    │   ├── Jira
    │   └── Tools/         ← deeper folders are flattened into their group
    └── News/
```

The folder can live anywhere in your bookmarks. The page looks it up by name, because bookmark IDs differ between PCs. Edits in the Bookmark Manager show up on open new tabs right away.

## Install (on each PC)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Open a new tab. If Chrome asks whether to keep the changed new tab page, choose **Keep it**.
4. If the `NewTab` folder doesn't exist yet, click the button on the page to create it in the Bookmarks bar.

Tip: if you keep this folder in OneDrive, every PC loads the same copy. After changing the code, click the reload icon on the extension card.
