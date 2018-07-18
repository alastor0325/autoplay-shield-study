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
    let baseDomain = this.getBaseDomain(url);
    Logger.log(`Domain = ${baseDomain}`);

    let hash = 0, i, chr;
    if (baseDomain.length === 0) return hash;
    for (i = 0; i < baseDomain.length; i++) {
      chr   = baseDomain.charCodeAt(i);
      hash  = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    Logger.log(`HashCode = ${hash}`);
    return hash;
  }

  async handleUpdated(tabId, changeInfo, tabInfo) {
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

    browser.autoplay.hasAudibleAutoplayMediaContent(tabId).then((url) => {
      this.feature.update("autoplayOccur", this.getBaseDomainHash(url));
    }).catch((error) => {
      Logger.log("### get error=" + error);
    });

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
    this.telemetry = new TelemetrySender();
  }

  async sendPing() {
    let payload = this.constructPayload("counts");
    await this.telemetry.sendTelemetry(payload);
    Logger.log(payload);
  }

  constructPayload(type) {
    let payload = {
      id : GenerateUUID(),
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
        break;
      case "settings":
        break;
      default:
        console.log("Error : incorrect payload type");
        break;
    }
    return payload;
  }

  updatePingData(type, hashCode) {
    Logger.log(`type : ${type}, add ${hashCode} to ping`);
    switch (type) {
      case "visitPage":
        this.domainUserVisited.add(hashCode);
        break;
      case "autoplayOccur":
        this.domainWithAutoplay.add(hashCode);
        break;
      default:
        console.log("Error : incorrect data type");
        break;
    }

    // For test
    this.showAllDomainHaseCode();
    this.sendPing();
  }

  showAllDomainHaseCode() {
    for (let item of this.domainUserVisited) {
      Logger.log(item);
    }
    for (let item of this.domainWithAutoplay) {
      Logger.log(item);
    }
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

function GenerateUUID() {
  return  Math.random().toString(36).substring(2, 15) +
          Math.random().toString(36).substring(2, 15);
}

// make an instance of the feature class available to background.js
// construct only. will be configured after setup
window.feature = new Feature();
