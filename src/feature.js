/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(feature)" }]*/

/**  Example Feature module for a Shield Study.
 *
 *  UI:
 *  - during INSTALL only, show a notification bar with 2 buttons:
 *    - "Thanks".  Accepts the study (optional)
 *    - "I don't want this".  Uninstalls the study.
 *
 *  Firefox code:
 *  - Implements the 'introduction' to the 'button choice' study, via notification bar.
 *
 *  Demonstrates `studyUtils` API:
 *
 *  - `telemetry` to instrument "shown", "accept", and "leave-study" events.
 *  - `endStudy` to send a custom study ending.
 *
 **/
class Feature {
  constructor() {}
  /** A Demonstration feature.
   *
   *  - variation: study info about particular client study variation
   *  - reason: string of background.js install/startup/shutdown reason
   *
   */
  configure(studyInfo) {
    const feature = this;
    const { variation, isFirstRun } = studyInfo;
    console.log("#### configure feature");
    console.log(studyInfo);

    new autoplayShieldStudyFeature();

    // // perform something only during first run
    // if (isFirstRun) {
    //   browser.introductionNotificationBar.onIntroductionShown.addListener(
    //     () => {
    //       console.log("onIntroductionShown");

    //       feature.sendTelemetry({
    //         event: "onIntroductionShown",
    //       });
    //     },
    //   );

    //   browser.introductionNotificationBar.onIntroductionAccept.addListener(
    //     () => {
    //       console.log("onIntroductionAccept");
    //       feature.sendTelemetry({
    //         event: "onIntroductionAccept",
    //       });
    //     },
    //   );

    //   browser.introductionNotificationBar.onIntroductionLeaveStudy.addListener(
    //     () => {
    //       console.log("onIntroductionLeaveStudy");
    //       feature.sendTelemetry({
    //         event: "onIntroductionLeaveStudy",
    //       });
    //       browser.study.endStudy("introduction-leave-study");
    //     },
    //   );

    //   browser.introductionNotificationBar.show(variation.name);
    // }
  }

  /* good practice to have the literal 'sending' be wrapped up */
  sendTelemetry(stringStringMap) {
    browser.study.sendTelemetry(stringStringMap);
  }

  /**
   * Called at end of study, and if the user disables the study or it gets uninstalled by other means.
   */
  async cleanup() {}

  /**
   * Example of a utility function
   *
   * @param variation
   * @returns {string}
   */
  static iconPath(variation) {
    return `icons/${variation.name}.svg`;
  }
}

class autoplayShieldStudyFeature {
  constructor() {
    console.log("#### ctor of autoplayShieldStudyFeature");

    browser.tabs.onUpdated.addListener(
      (tabId, changeInfo, tabInfo) =>
        this.handleUpdated(tabId, changeInfo, tabInfo)
    );
    this.domainSet = new Set();
    // browser.tabs.onUpdated.addListener(this.handleUpdated);
  };

  isSupportURLProtocol(url) {
    return !!(url.match(/^(http(s?):\/\/)/im));
  };

  getBaseDomain(url) {
    return url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n]+)/im)[1];
  };

  handleUpdated(tabId, changeInfo, tabInfo) {
    if (!changeInfo.url) {
      return;
    }

    let url = changeInfo.url;
    Logger.log(`TabId: ${tabId}, URL changed to ${url}`);

    if (!this.isSupportURLProtocol(url)) {
      return;
    }

    let domain = this.getBaseDomain(url);
    Logger.log(`Domain = ${domain}`);
    Logger.log(`HashCode = ${domain.hashCode()}`);
    this.domainSet.add(domain.hashCode());

    for (let item of this.domainSet) {
      Logger.log(item);
    }
  };
}

var Logger = {
  openLog : true,
  log : function log(msg) {
    if (!!this.openLog) {
      console.log(msg);
    }
  }
};

String.prototype.hashCode = function() {
  var hash = 0, i, chr;
  if (this.length === 0) return hash;
  for (i = 0; i < this.length; i++) {
    chr   = this.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

// make an instance of the feature class available to background.js
// construct only. will be configured after setup
window.feature = new Feature();
