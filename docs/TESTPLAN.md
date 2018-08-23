# Test plan for this add-on

<!-- START doctoc generated TOC please keep comment here to allow auto update -->

<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

**Contents**

* [Manual / QA TEST Instructions](#manual--qa-test-instructions)
  * [Preparations](#preparations)
  * [Install the add-on and enroll in the study](#install-the-add-on-and-enroll-in-the-study)
* [Expected User Experience / Functionality](#expected-user-experience--functionality)
  * [Do these tests](#do-these-tests)
  * [Design](#design)
* [Debug](#debug)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Manual / QA TEST Instructions

### Preparations

* Download a Firefox (at least version 63)

### Install the add-on and enroll in the study

* (Create profile: <https://developer.mozilla.org/Firefox/Multiple_profiles>, or via some other method)
* Navigate to _about:config_ and set the following preferences. (If a preference does not exist, create it be right-clicking in the white area and selecting New -> String)
* Set `xpinstall.signatures.required` to `false` 
* Set `extensions.legacy.enabled` to `true`
* **[optional]** Set `shieldStudy.logLevel` to `All`. This permits shield-add-on log output in browser console.
* **[optional]** Set `extensions.autoplay-shield-study_shield_mozilla_org.test.variationName` to `the branch name you want to test`, eg. `control`, `allow-and-notRemember`...  (if you want to test a specific branch)
* Go to [this study's tracking bug](https://bugzilla.mozilla.org/show_bug.cgi?id=1475099) and install the latest add-on zip file

## Expected User Experience / Functionality

### User interface changed

We have five different testing branches, 
1. `control` 
2. `allow-and-notRemember` 
3. `deny-and-notRemember` 
4. `allow-and-remember` 
5. `deny-and-remember`

In control branch, we would enable autoplay by default. It won't have any interface changed.

In other 4 branches, we would show the doorhanger to ask user whether they want to allow the site autoplay. Each testing branch has different options layout. 

Eg. In the branch `allow-and-notRemember`, the default option of the doorhanger would be "Allow autoplay" and the checkbox 
"remember this decision" is not checked.

### Functionality

We would collect three different information, 

1. counts : the data about user visited sites and the amount of autoplay sites 
2. prompt : about the options user clicked on the doorhanger
3. setting : when user changed the autoplay setting in about:preference page.
 
### Do these tests

####  How to observe the log 
see the log from `Tools > Web Developer > Browser Console`

#### How to observe the telemetry  
1. open page "about:telemetry" 
2. clicking "main" and then it would show a popup menu
3. choose "Archived ping data" in ping data source, choose "block-autoplay" in ping type

#### Ping collection
1. every time user visit to a new website

   Expect : log shows `updatePingData, type=visitPage` and the object contains `pageId` which is a salted-hash for the top-level origin
   
2. when website has audible autoplay content

   Expect : log shows `updatePingData, type=autoplayOccur` and the object contains `pageId` which is a salted-hash for the top-level origin
   
3. after user clicked the autoplay doorhanger

   Expect : log shows `updatePingData, type=promptChanged` and the object contains the details of this change.
   
4. after user change the global autoplay setting in about:preference page

   Expect : log shows `updatePingData, type=settingChanged` and the object contains the details of this change.
   
5. after user change the page whitelist autoplay setting in about:preference page

   Expect : log shows `updatePingData, type=settingChanged` and the object contains the details of this change.

#### Ping sending
Every time user close the browser, we would group the data and send three pings, which are "counts", "prompt" and "settings". Three pings have differnt type format, see details in [TELEMETRY.md](./TELEMETRY.md).

If user is in the "control" branch, we would only send "counts".
For other 4 branches, we would also sent the "prompt" and "setting" if user have changed the prompt or setting.

### Design

Any UI in a Shield study should be consistent with standard Firefox design specifications. These standards can be found at [design.firefox.com](https://design.firefox.com/photon/welcome.html). Firefox logo specifications can be found [here](https://design.firefox.com/photon/visuals/product-identity-assets.html).

## Debug

To debug installation and loading of the add-on:

* Open the Browser Console using Firefox's top menu at `Tools > Web Developer > Browser Console`. This will display Shield (loading/telemetry) and log output from the add-on.
