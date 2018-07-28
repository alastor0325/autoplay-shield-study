# Telemetry sent by this add-on

<!-- START doctoc generated TOC please keep comment here to allow auto update -->

<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

**Contents**

* [Usual Firefox Telemetry is mostly unaffected](#usual-firefox-telemetry-is-mostly-unaffected)
* [Study-specific endings](#study-specific-endings)
* [`shield-study` pings (common to all shield-studies)](#shield-study-pings-common-to-all-shield-studies)
* [`shield-study-addon` pings, specific to THIS study.](#shield-study-addon-pings-specific-to-this-study)
* [Example sequence for a 'voted => not sure' interaction](#example-sequence-for-a-voted--not-sure-interaction)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Usual Firefox Telemetry is mostly unaffected

* No change: `main` and other pings are UNAFFECTED by this add-on, except that [shield-studies-addon-utils](https://github.com/mozilla/shield-studies-addon-utils) adds the add-on id as an active experiment in the telemetry environment.
* Respects telemetry preferences. If user has disabled telemetry, no telemetry will be sent.

## Study-specific endings

TBD

## `shield-study` pings (common to all shield-studies)

[shield-studies-addon-utils](https://github.com/mozilla/shield-studies-addon-utils) sends the usual packets.

## `shield-study-addon` pings, specific to THIS study.

```
{
  // incremented integer, just to discriminate one blob from another
  "id": 2,

  // unique client id
  "client_id": "wdasdqewdj23dadasdasd",

  // a label corresponding to which branch profile is in
  // branches are as following, besides "control" branch, other branches have
  // different default botton and check-boxed actions
  // 1) "control" (enable autoplay)
  // 2) "allow-and-notRemember" (
  // 3) "deny-and-notRemember"
  // 3) "allow-and-remember"
  // 3) "deny-and-remember"
  "branch": "control",

  // this is identifies what information will be in this blob can be one of
  // 'prompt' or 'settings' or 'counts'
  "type": "prompt",

  // present when sending counts
  "counters": {
    // this is either total # domains or total pages visited
    // it is running count till the data structure is sent back
    // and then reset to 0
    "totalPages": 200,

    // running total pages/domain names with auto-play media
    "totalPagesAM": 20,

    // running total of # of autoplay media blocked (in control group, this
    // means total # of autoplay media which might be blocked if disable
    // autoplay )
    "totalBlockedVideos": 20,
  },


  // [optional] this field must be present if type == 'prompt'
  "promptResponse": {
    // hash of top level domain which is salted-hashed
    "pageid": "q3ewdwdad",

    // timestamp of when page was visited.
    "timestamp": 21231239123121,

    // value of "remember this decision" checkbox
    "rememberCheckbox": true,

    // true if user clicked "Allow Autoplay", false if user clicked
    // "Dont Allow".
    "allowAutoPlay": true
  },

  // [optional] this field must be present if type == 'settings'
  "settingsChanged":{
    // timestamp of when setting was changed.
    "timestamp": 21231239123121,

    // [optional] if a global setting was changed
    "globalSettings":{
        // the states are “allow”, “block” or “ask”
        "allowAutoPlay": “ask”
    },

    // [optional] when user manually changed the settings for a page.
    "pageSpecific":{
      // hash of top level domain which is salted-hashed
      "pageid": "qwdqwdqded",

      // the states are “allow”, “block” or "default"
      "allowAutoPlay":“allow”
    }
  },
}
```

## Example sequence for ping

These are the `payload` fields from all pings in the `shield-study` and `shield-study-addon` buckets.

```
// common fields for "shield-study"

branch        one of the branch described on above
study_name    autoplay-shield-study@shield.mozilla.org
addon_version 2.0.0
version       3

2018-08-01T14:16:18.042Z shield-study
{
  "study_state": "enter"
}

2018-08-01T14:16:18.055Z shield-study
{
  "study_state": "installed"
}

2018-08-01T14:16:18.066Z shield-study-addon
{
  "id":0,
  "client_id":"2ffc5ce3-1b70-974a-9dac-109ec96cf83c",
  "branch":"none",
  "type":"counts",
  "counters": {
    "totalPages":3,
    "totalPagesAM":1,
    "totalBlockedAudibleMedia":1,
  }
}

2018-08-01T16:29:44.109Z shield-study-addon
{
  "id":1,
  "client_id":"2ffc5ce3-1b70-974a-9dac-109ec96cf83c",
  "branch":"none",
  "type":"prompt",
  "promptResponse":[
    {
      "pageId":109466335,
      "timestamp":1532567717284,
      "rememberCheckbox":false,
      "allowAutoPlay":false,
    },
  ]
}

2018-08-01T16:29:44.188Z shield-study-addon
{
  "id":2,
  "client_id":"2ffc5ce3-1b70-974a-9dac-109ec96cf83c",
  "branch":"none",
  "type":"settings",
  "settingsChanged":[
    {
      "timestamp":1532567696509,
      "globalSettings":{
          "allowAutoPlay":1,
      },
    },
    {
      "timestamp":1532567697598,
      "globalSettings":{
          "allowAutoPlay":2,
      },
    },
    {
      "timestamp":1532567700984,
      "pageSpecific":{
          "pageId":1780114461,
          "allowAutoplay":true,
      },
    },
  ]
}

2018-08-01T16:29:44.191Z shield-study
{
  "study_state": "exit"
}
```
