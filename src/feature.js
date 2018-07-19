/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(feature)" }]*/

class TabsMonitor {
  constructor(feature) {
    this.feature = feature;
    browser.tabs.onUpdated.addListener(this.handleUpdated.bind(this));
  }

  isSupportURLProtocol(url) {
    return !!(url.match(/^(http(s?):\/\/)/im));
  }

  getBaseDomain(url) {
    return url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n]+)/im)[1];
  }

  getBaseDomainHash(url) {
    // TODO : salted-hash
    let baseDomain = this.getBaseDomain(url);
    Logger.log(`Domain = ${baseDomain}`);

    let hash = 0, i, chr;
    if (baseDomain.length === 0) {
      return hash
    };
    for (i = 0; i < baseDomain.length; i++) {
      chr   = baseDomain.charCodeAt(i);
      hash  = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    Logger.log(`HashCode = ${hash}`);
    return hash;
  }

  async checkTabAutoplayStatus(tabId) {
    let url = await browser.autoplay.hasAutoplayMediaContent(tabId);
    if (!this.isSupportURLProtocol(url)) {
      return;
    }

    let hashURL = this.getBaseDomainHash(url);
    this.feature.update("autoplayOccur", hashURL);

    let permission = await browser.autoplay.getAutoplayPermission(tabId, url);
    this.feature.update("promptChanged", {
      pageId : hashURL,
      timestamp : Date.now(),
      rememberCheckbox : permission.rememberCheckbox,
      allowAutoPlay : permission.allowAutoPlay,
    });
  }

  handleUpdated(tabId, changeInfo, tabInfo) {
    if (!changeInfo.url) {
      return;
    }

    let url = changeInfo.url;
    Logger.log(`@@@ update : TabId: ${tabId}, URL changed to ${url}`);
    if (!this.isSupportURLProtocol(url)) {
      return;
    }

    let domain = this.getBaseDomainHash(url);
    this.feature.update("visitPage", domain);
    this.checkTabAutoplayStatus(tabId)
  }
}

class TelemetrySender {
  constructor() {}

  sendTelemetry(payload) {
    // browser.study.sendTelemetry(payload);
    // Add validation for JSON
    browser.autoplay.sendTelemetry(payload)
  }
};

class ShieldStudyPing {
  constructor() {
    this.domainUserVisited = new Set();
    this.domainWithAutoplay = new Set();
    this.blockedMediaCount = 0;
    this.promptResponses = [];
    this.telemetry = new TelemetrySender();
  }

  updatePingData(type, data) {
    Logger.log(`type : ${type}`);
    Logger.log(data);
    switch (type) {
      case "visitPage":
        this.domainUserVisited.add(data);
        break;
      case "autoplayOccur":
        this.domainWithAutoplay.add(data);
        break;
      case "promptChanged":
        this.promptResponses.push(data);
        break;
      default:
        console.log("Error : incorrect data type");
        break;
    }

    // For test
    if (this.domainUserVisited.size >= 3) {
      this._showAllDomainHaseCode();
      this._sendPing();
    }
  }

  async _sendPing() {
    console.log("@@@@@ send ping");
    let payload = this._constructPayload("counts");
    await this.telemetry.sendTelemetry(payload);

    while (this.promptResponses.length > 0) {
      payload = this._constructPayload("prompt");
      await this.telemetry.sendTelemetry(payload);
    }
  }

  // Utilities functions
  _constructPayload(type) {
    let payload = {
      id : this._generateUUID(),
      type : type
    };
    switch (type) {
      case "counts":
          payload.counters = {
            totalPages : this.domainUserVisited.size,
            totalPagesAM : this.domainWithAutoplay.size,
            totalBlockedVideos : this.blockedMediaCount
          }
        break;
      case "prompt":
          payload.promptResponse = this.promptResponses.shift();
        break;
      case "settings":
        break;
      default:
        console.log("Error : incorrect payload type");
        break;
    }
    Logger.log(payload);
    return payload;
  }

  _showAllDomainHaseCode() {
    for (let item of this.domainUserVisited) {
      Logger.log(item);
    }
    for (let item of this.domainWithAutoplay) {
      Logger.log(item);
    }
  }

  _generateUUID() {
    return  Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
  }
}

class Feature {
  constructor() {
    this.ping = new ShieldStudyPing();
    this.tabsMonitor = new TabsMonitor(this);
  }

  configure(studyInfo) {
    const feature = this;
    const { variation, isFirstRun } = studyInfo;
    console.log(studyInfo);
    browser.autoplay.setPreferences();
  }

  update(type, data) {
    this.ping.updatePingData(type, data);
  }

  /**
   * Called at end of study, and if the user disables the study or it gets
   * uninstalled by other means.
   */
  async cleanup() {}
}

var Logger = {
  openLog : true,
  log : function log(msg) {
    if (!!this.openLog) {
      console.log(msg);
    }
  }
};

// make an instance of the feature class available to background.js
// construct only. will be configured after setup
window.feature = new Feature();
