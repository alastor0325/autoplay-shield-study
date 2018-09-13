/* global getStudySetup, feature */

/**
 *  Goal:  Implement an instrumented feature using `browser.study` API
 *
 *  Every runtime:
 *  - Prepare
 *
 *    - listen for `onEndStudy` (study endings)
 *    - listen for `study.onReady`
 *
 *  - Startup the feature
 *
 *    - attempt to `browser.study.setup` the study using our studySetup
 *
 *      - will fire EITHER
 *        -  `endStudy` (`expired`, `ineligible`)
 *        - onReady
 *      - (see docs for `browser.study.setup`)
 *
 *    - onReady: configure the feature to match the `variation` study selected
 *    - or, if we got an `onEndStudy` cleanup and uninstall.
 *
 */

class StudyLifeCycleHandler {
  /**
   * Listen to onEndStudy, onReady
   * `browser.study.setup` fires onReady OR onEndStudy
   *
   * call `this.enableFeature` to actually do the feature/experience/ui.
   */
  constructor() {
    /*
     * IMPORTANT:  Listen for `onEndStudy` before calling `browser.study.setup`
     * because:
     * - `setup` can end with 'ineligible' due to 'allowEnroll' key in first session.
     *
     */
    browser.study.onEndStudy.addListener(this.handleStudyEnding.bind(this));
    browser.study.onReady.addListener(this.enableFeature.bind(this));
    browser.autoplay.onStudyEnd.addListener(this.handleNormandyEnding.bind(this));
  }

  /**
   * Cleanup
   *
   * (If you have privileged code, you might need to clean
   *  that up as well.
   * See:  https://firefox-source-docs.mozilla.org/toolkit/components/extensions/webextensions/lifecycle.html
   *
   * @returns {undefined}
   */
  async cleanup() {
    await browser.storage.local.clear();
    await feature.cleanup();
  }

  /**
   *
   * side effects
   * - set up expiration alarms
   * - make feature/experience/ui with the particular variation for this user.
   *
   * @param {object} studyInfo browser.study.studyInfo object
   *
   * @returns {undefined}
   */
  enableFeature(studyInfo) {
    console.log("Enabling experiment", studyInfo);
    const { delayInMinutes } = studyInfo;
    if (delayInMinutes !== undefined) {
      const alarmName = `${browser.runtime.id}:studyExpiration`;
      const alarmListener = async alarm => {
        if (alarm.name === alarmName) {
          browser.alarms.onAlarm.removeListener(alarmListener);
          await browser.study.endStudy("expired");
        }
      };
      browser.alarms.onAlarm.addListener(alarmListener);
      browser.alarms.create(alarmName, {
        delayInMinutes,
      });
    }
    feature.configure(studyInfo);
  }

  /** handles `study:end` signals
   *
   * - opens 'ending' urls (surveys, for example)
   * - calls cleanup
   *
   * @param {object} ending An ending result
   *
   * @returns {undefined}
   */
  async handleStudyEnding(ending) {
    console.log(`Study wants to end:`, ending);
    for (const url of ending.urls) {
      await browser.tabs.create({ url });
    }
    switch (ending.endingName) {
      // could have different actions depending on positive / ending names
      default:
        console.log(`The ending: ${ending.endingName}`);
        await this.cleanup();
        break;
    }
    // actually remove the addon.
    console.log("About to actually uninstall");
    return browser.management.uninstallSelf();
  }

  handleNormandyEnding() {
    console.log(`Study was ended by Normandy.`);
    browser.study.endStudy("user-disable");
  }
}

/**
 * Run every startup to get config and instantiate the feature
 *
 * @returns {undefined}
 */
async function onEveryExtensionLoad() {
  new StudyLifeCycleHandler();

  const studySetup = await getStudySetup();
  console.log(`Study setup: `, studySetup);
  await browser.study.setup(studySetup);
}
onEveryExtensionLoad();
