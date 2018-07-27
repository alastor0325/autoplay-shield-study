/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(feature)" }]*/

const gId = generateUUID();

function generateUUID() {
  return  Math.random().toString(36).substring(2, 15) +
          Math.random().toString(36).substring(2, 15);
}

function isSupportURLProtocol(url) {
  return !!(url.match(/^(http(s?):\/\/)/im));
}

function getBaseDomain(url) {
  return url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n]+)/im)[1];
}

function getBaseDomainHash(url) {
  let baseDomain = getBaseDomain(url);
  let hash = 0, i, chr;
  if (baseDomain.length === 0) {
    return hash
  };

  // use salted-hash
  baseDomain += gId;
  for (i = 0; i < baseDomain.length; i++) {
    chr   = baseDomain.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

class TabsMonitor {
  constructor(feature) {
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

    let hashURL = getBaseDomainHash(url);
    this.feature.update("autoplayOccur", hashURL);

    let permission = await browser.autoplay.getAutoplayPermission(tabId, url);
    this.feature.update("promptChanged", {
      pageId : hashURL,
      timestamp : Date.now(),
      rememberCheckbox : permission.rememberCheckbox,
      allowAutoPlay : permission.allowAutoPlay,
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

  autoplaySettingChanged(data) {
    if (data.pageSpecific) {
      data.pageSpecific.pageId = getBaseDomainHash(data.pageSpecific.pageId);
    }
    this.feature.update("settingChanged", data);
  }

  addSettingTabId(tabId) {
    this.settingTabIds.add(tabId);
    if (this.settingTabIds.size == 1) {
      browser.autoplay.autoplaySettingChanged.addListener(this.settingListener);
    }
  }

  removeSettingTabId(tabId) {
    this.settingTabIds.delete(tabId);
    if (this.settingTabIds.size == 0) {
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

  handleUpdated(tabId, changeInfo, tabInfo) {
    if (!changeInfo.url) {
      return;
    }

    let url = changeInfo.url;
    console.log(`tab update : TabId: ${tabId}, URL changed to ${url}`);
    if (this.checkIfEneteringSettingPrivacyPage(tabId, url)) {
      return;
    }

    if (!isSupportURLProtocol(url)) {
      return;
    }

    let domain = getBaseDomainHash(url);
    this.feature.update("visitPage", domain);
  }

  handleRemoved(tabId, removeInfo) {
    if (this.settingTabIds.has(tabId)) {
      this.removeSettingTabId(tabId);
    }
  }
}

class Feature {
  constructor() {
    this.id = generateUUID();
    this.tabsMonitor = new TabsMonitor(this);

    const sendPingIntervalMS = 1 * 24 * 60 * 60 * 1000;
    this.sendPingsScheduler(sendPingIntervalMS);

    // for test
    browser.browserAction.onClicked.addListener(() => {
      console.log("@@@@@ test send ping");
      browser.autoplay.sendTelemetry();
    });
  }

  configure(studyInfo) {
    const feature = this;
    const { variation, isFirstRun } = studyInfo;
    console.log(studyInfo);
    browser.autoplay.setPreferences(variation.name);
  }

  update(type, data) {
    if (type == "visitPage" || type == "autoplayOccur") {
       data = {pageId : data};
    }
    browser.autoplay.updatePingData(type, data);
  }

  sendPingsScheduler(interval) {
     setInterval((interval) => {
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
