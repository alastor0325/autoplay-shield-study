/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(feature)" }]*/

const gId = generateUUID();

function generateUUID() {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

// Hash function from https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
async function sha256(message) {
  // encode as UTF-8
  const msgBuffer = new TextEncoder('utf-8').encode(message);

  // hash the message
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);

  // convert ArrayBuffer to Array
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  // convert bytes to hex string
  const hashHex = hashArray.map(b => ('00' + b.toString(16)).slice(-2)).join('');
  return hashHex;
}

function isSupportURLProtocol(url) {
  return !!(url.match(/^(http(s?):\/\/)/im));
}

function getBaseDomain(url) {
  return url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n]+)/im)[1];
}

async function getBaseDomainHash(url) {
  const baseDomain = getBaseDomain(url);
  if (baseDomain.length === 0) {
    return hash;
  }

  const hash = await sha256(baseDomain + gId);
  return hash;
}

class TabsMonitor {
  configure(feature) {
    this.feature = feature;
    this.settingTabIds = new Set();
    this.privacyPageURL = "about:preferences#privacy";
    this.settingListener = this.autoplaySettingChanged.bind(this);
    this.autoplayListener = this.handleAutoplayOccurred.bind(this);
    this.tabUpdatedListener = this.handleUpdated.bind(this);
    this.tabRemovedListener = this.handleRemoved.bind(this);

    browser.tabs.onUpdated.addListener(this.tabUpdatedListener);
    browser.tabs.onRemoved.addListener(this.tabRemovedListener);
    browser.autoplay.audibleAutoplayOccurred.addListener(this.autoplayListener);
  }

  async handleAutoplayOccurred(tabId, url) {
    console.log(`handleAutoplayOccurred, url=${url}, id=${tabId}`);
    if (!isSupportURLProtocol(url)) {
      return;
    }

    const hashURL = await getBaseDomainHash(url);
    this.feature.update("autoplayOccur", hashURL);

    const permission = await browser.autoplay.getAutoplayPermission(tabId, url);
    this.feature.update("promptChanged", {
      pageId: hashURL,
      timestamp: Date.now(),
      rememberCheckbox: permission.rememberCheckbox,
      allowAutoPlay: permission.allowAutoPlay,
    });
  }

  clear() {
    browser.tabs.onUpdated.removeListener(this.tabUpdatedListener);
    browser.tabs.onRemoved.removeListener(this.tabRemovedListener);
    browser.autoplay.audibleAutoplayOccurred.removeListener(this.autoplayListener);
    if (browser.autoplay.autoplaySettingChanged.hasListener(this.settingListener)) {
      browser.autoplay.autoplaySettingChanged.removeListener(this.settingListener);
    }
  }

  async autoplaySettingChanged(data) {
    if (data.pageSpecific) {
      data.pageSpecific.pageId = await getBaseDomainHash(data.pageSpecific.pageId);
    }
    this.feature.update("settingChanged", data);
  }

  addSettingTabId(tabId) {
    this.settingTabIds.add(tabId);
    if (this.settingTabIds.size === 1) {
      browser.autoplay.autoplaySettingChanged.addListener(this.settingListener);
    }
  }

  removeSettingTabId(tabId) {
    this.settingTabIds.delete(tabId);
    if (this.settingTabIds.size === 0) {
      browser.autoplay.autoplaySettingChanged.removeListener(this.settingListener);
    }
  }

  checkIfEneteringSettingPrivacyPage(tabId, url) {
    if (url === this.privacyPageURL && !this.settingTabIds.has(tabId)) {
      this.addSettingTabId(tabId);
      return true;
    } else if (this.settingTabIds.has(tabId) && url !== this.privacyPageURL) {
      this.removeSettingTabId(tabId);
    }
    return false;
  }

  async handleUpdated(tabId, changeInfo, tabInfo) {
    if (!changeInfo.url) {
      return;
    }

    const url = changeInfo.url;
    console.log(`tab update : TabId: ${tabId}, URL changed to ${url}`);
    if (this.checkIfEneteringSettingPrivacyPage(tabId, url)) {
      return;
    }

    if (!isSupportURLProtocol(url)) {
      return;
    }

    const pageId = await getBaseDomainHash(url);
    this.feature.update("visitPage", pageId);
  }

  handleRemoved(tabId, removeInfo) {
    if (this.settingTabIds.has(tabId)) {
      this.removeSettingTabId(tabId);
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
    this.sendPingsScheduler(sendPingIntervalMS);

    browser.autoplay.setPreferences(variation.name);
  }

  update(type, data) {
    if (type === "visitPage" || type === "autoplayOccur") {
      data = {pageId: data};
    }
    browser.autoplay.updatePingData(type, data);
  }

  sendPingsScheduler(interval) {
     setInterval(() => {
      browser.autoplay.sendTelemetry();
    }, interval);
  }

  /**
   * Called at end of study, and if the user disables the study or it gets
   * uninstalled by other means.
   */
  async cleanup() {
    this.tabsMonitor.clear();
  }
}

// make an instance of the feature class available to background.js
// construct only. will be configured after setup
window.feature = new Feature();
