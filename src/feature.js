/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(feature)" }]*/

function generateRandomString() {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

function isSupportedURLProtocol(url) {
  return !!(url.match(/^(http(s?):\/\/)/im));
}

function getHostName(url) {
  return url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n]+)/im)[1];
}

async function getHostNameId(url) {
  const hostName = getHostName(url);
  const gettingItem = await browser.storage.local.get(hostName).catch((e) => {
    throw "Error : can not get host id from local storage";
  });

  if (!gettingItem.hasOwnProperty(hostName)) {
    const randomId = generateRandomString();
    await browser.storage.local.set({ [hostName] : randomId }).catch((e) => {
      throw "Error : can not set host id to local storage";
    });
    return randomId;
  } else {
    return gettingItem[hostName];
  }
}

class TabsMonitor {
  configure(feature) {
    this.feature = feature;
    this.settingListener = this.autoplaySettingChanged.bind(this);
    this.autoplayListener = this.handleAutoplayOccurred.bind(this);
    this.tabUpdatedListener = this.handleUpdated.bind(this);
    this.tabRemovedListener = this.handleRemoved.bind(this);
    this.tabActivatedListener = this.handleActivated.bind(this);
    this.activatedTabId = 0;

    browser.tabs.onActivated.addListener(this.tabActivatedListener);
    browser.tabs.onUpdated.addListener(this.tabUpdatedListener);
    browser.tabs.onRemoved.addListener(this.tabRemovedListener);
    browser.autoplay.audibleAutoplayOccurred.addListener(this.autoplayListener);
  }

  clear() {
    browser.tabs.onUpdated.removeListener(this.tabUpdatedListener);
    browser.tabs.onRemoved.removeListener(this.tabRemovedListener);
    browser.tabs.onActivated.removeListener(this.tabActivatedListener);
    browser.autoplay.audibleAutoplayOccurred.removeListener(this.autoplayListener);
    if (browser.autoplay.autoplaySettingChanged.hasListener(this.settingListener)) {
      browser.autoplay.autoplaySettingChanged.removeListener(this.settingListener);
    }
  }

  async handleAutoplayOccurred(tabId, url) {
    console.log(`handleAutoplayOccurred, url=${url}, id=${tabId}`);
    if (!isSupportedURLProtocol(url)) {
      return;
    }

    const hashURL = await getHostNameId(url);
    this.feature.update("autoplayOccur", hashURL);

    const permission = await browser.autoplay.getAutoplayPermission(tabId, url);
    this.feature.update("promptChanged", {
      pageId: hashURL,
      timestamp: Date.now(),
      rememberCheckbox: permission.rememberCheckbox,
      allowAutoPlay: permission.allowAutoPlay,
    });
  }

  async autoplaySettingChanged(data) {
    if (data.pageSpecific) {
      data.pageSpecific.pageId = await getHostNameId(data.pageSpecific.pageId);
    }
    this.feature.update("settingChanged", data);
  }

  maybeUpdateSettingListener(tabId, url) {
    if (tabId !== this.activatedTabId) {
      return;
    }

    // The API `browser.autoplay.autoplaySettingChanged` listens the notification
    // `perm-changed`, but this notification might happend from different way,
    // eg. doorhanger, chrome js ..e.t.c. However, we only want to know the
    // changed happened in the `about:preferences` page, so register the listener
    // only when we're in the privacy page of `about:preferences` which is used
    // to change autoplay preferece.
    const isPrivacyPage = url === "about:preferences#privacy";
    const hasRegisteredListener = browser.autoplay.autoplaySettingChanged.hasListener(this.settingListener);
    if (!isPrivacyPage && hasRegisteredListener) {
      browser.autoplay.autoplaySettingChanged.removeListener(this.settingListener);
    } else if (isPrivacyPage && !hasRegisteredListener) {
      // only register listener when `page is in foreground` and `page is a
      // `privacy page in `about:preferences`.
      browser.autoplay.autoplaySettingChanged.addListener(this.settingListener);
    }
  }

  async handleActivated(activeInfo) {
    const tab = await browser.tabs.get(activeInfo.tabId);
    this.activatedTabId = tab.id;
    this.maybeUpdateSettingListener(tab.id, tab.url);
  }

  async handleUpdated(tabId, changeInfo, tabInfo) {
    if (!changeInfo.url) {
      return;
    }

    const url = changeInfo.url;
    console.log(`tab update : TabId: ${tabId}, URL changed to ${url}`);
    this.maybeUpdateSettingListener(tabId, url);
    if (!isSupportedURLProtocol(url)) {
      return;
    }

    const pageId = await getHostNameId(url);
    this.feature.update("visitPage", pageId);
  }

  handleRemoved(tabId, removeInfo) {
    if (this.activatedTabId === tabId &&
        browser.autoplay.autoplaySettingChanged.hasListener(this.settingListener)) {
      browser.autoplay.autoplaySettingChanged.removeListener(this.settingListener);
    }
  }
}

class Feature {
  constructor() {}

  configure(studyInfo) {
    const feature = this;
    const { variation, isFirstRun } = studyInfo;
    console.log(studyInfo);

    this.tabsMonitor = new TabsMonitor();
    this.tabsMonitor.configure(this);
    const sendPingIntervalMS = 1 * 24 * 60 * 60 * 1000;

    this.sendPingsScheduler = setInterval(() => {
      browser.autoplay.sendTelemetry();
    }, sendPingIntervalMS);

    browser.autoplay.setPreferences(variation.name);
  }

  update(type, data) {
    if (type === "visitPage" || type === "autoplayOccur") {
      data = {pageId: data};
    }
    browser.autoplay.updatePingData(type, data);
  }

  /**
   * Called at end of study, and if the user disables the study or it gets
   * uninstalled by other means.
   */
  async cleanup() {
    this.tabsMonitor.clear();
    // restoring to the default option.
    browser.autoplay.clearPreferences();
    clearInterval(this.sendPingsScheduler);
  }
}

// make an instance of the feature class available to background.js
// construct only. will be configured after setup
window.feature = new Feature();
