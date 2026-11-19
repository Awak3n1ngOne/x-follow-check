chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
})
